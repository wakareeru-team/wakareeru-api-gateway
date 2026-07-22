import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { AppEnv } from "../src/types";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
	return {
		...env,
		INFERENCE_ENDPOINT_URL: "https://inference.example.test/v2/endpoint-id",
		INFERENCE_API_KEY: "test-api-key",
		ANON_INFER_RATE_LIMITER: undefined,
		USER_INFER_RATE_LIMITER: undefined,
		DEV_INFER_RATE_LIMITER: undefined,
		...overrides,
	} as AppEnv;
}

function configKv(values: Record<string, string>): Pick<KVNamespace, "get"> {
	return {
		async get(key: string | string[]) {
			if (Array.isArray(key)) {
				return new Map(key.map((item) => [item, values[item] ?? null]));
			}
			return values[key] ?? null;
		},
	} as Pick<KVNamespace, "get">;
}

async function fetchWorker(request: Request, overrides: Partial<AppEnv> = {}): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv(overrides), ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function multipartRequest(body: FormData): Request {
	return new IncomingRequest("https://gateway.example.test/v1/infer", {
		method: "POST",
		headers: { "cf-connecting-ip": "203.0.113.10" },
		body,
	});
}

describe("wakareeru API gateway", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns health status", async () => {
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/health"));
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload.status).toBe("ok");
		expect(payload.service).toBe("wakareeru-api-gateway");
		expect(payload.request_id).toBeTypeOf("string");
	});

	it("returns version metadata from vars", async () => {
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/version"));
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload.api_version).toBe("v1");
		expect(payload.inference_provider).toBe("runpod");
	});

	it("returns model version from KV config", async () => {
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/version"), {
			wakareeru_config: configKv({ MODEL_VERSION: "0.3.0-alpha.1" }) as KVNamespace,
		});
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload.model_version).toBe("0.3.0-alpha.1");
	});

	it("returns the production announcement parsed from KV config", async () => {
		const announcement = {
			schemaVersion: 1,
			announcements: [
				{
					id: "alpha-welcome-20260718",
					priority: 100,
					enabled: true,
					title: {
						"zh-Hans": "欢迎参加 Alpha 测试",
						en: "Welcome to the Alpha Test",
						ja: "アルファテストへようこそ",
					},
					body: {
						"zh-Hans": "Wakareeru 目前处于早期测试阶段，识别结果可能不准确。",
						en: "Wakareeru is currently in an early testing stage. Recognition results may be inaccurate.",
						ja: "Wakareeruは現在初期テスト段階です。認識結果が正確でない場合があります。",
					},
				},
			],
		};
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/announce"), {
			wakareeru_config: configKv({
				"announcement:production": JSON.stringify(announcement),
			}) as KVNamespace,
		});
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload).toEqual(announcement);
	});

	it("returns not found when no production announcement is configured", async () => {
		const response = await fetchWorker(
			new IncomingRequest("https://gateway.example.test/announce"),
		);
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(404);
		expect(payload.error.code).toBe("announcement_not_found");
	});

	it("returns the gallery image assembled from KV config", async () => {
		const description = {
			"zh-CN": "夏日田野中行驶的列车",
			"ja-JP": "夏の田園を走る列車",
			en: "A train running through the summer countryside",
		};
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/gallery"), {
			wakareeru_config: configKv({
				GALLERY_IMAGE_ID: "summer-gallery-2026-07-v2",
				GALLERY_IMAGE_URL: "https://media.wakareeru.com/gallery/2026-summer.v2.webp",
				GALLERY_IMAGE_DESCRIPTION: JSON.stringify(description),
			}) as KVNamespace,
		});
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			schemaVersion: 1,
			image: {
				id: "summer-gallery-2026-07-v2",
				url: "https://media.wakareeru.com/gallery/2026-summer.v2.webp",
				description,
			},
		});
	});

	it("returns not found when the gallery KV config is incomplete", async () => {
		const response = await fetchWorker(new IncomingRequest("https://gateway.example.test/gallery"), {
			wakareeru_config: configKv({
				GALLERY_IMAGE_ID: "summer-gallery-2026-07-v2",
				GALLERY_IMAGE_URL: "https://media.wakareeru.com/gallery/2026-summer.v2.webp",
			}) as KVNamespace,
		});
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(404);
		expect(payload.error.code).toBe("gallery_not_found");
	});

	it("accepts multipart image and forwards base64 payload to inference backend", async () => {
		const upstreamFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			expect(String(url)).toBe("https://inference.example.test/v2/endpoint-id/runsync");
			const body = JSON.parse(String(init?.body));
			expect(body.input.image_base64).toBe("AQIDBA==");
			expect(body.input.top_k).toBe(3);
			expect(body.request_context.client_tier).toBe("anonymous");
			expect(init?.headers).toBeInstanceOf(Headers);
			expect((init?.headers as Headers).get("authorization")).toBe("Bearer test-api-key");

			const prediction = {
				label_id: 0,
				label: { ja: "101系", en: "101 series", zh: "101系" },
				operator: {
					ja: ["国鉄"],
					en: ["Japanese National Railways"],
					zh: ["日本国有铁道"],
				},
				probability: 0.8,
			};
			return Response.json({
				status: "ok",
				metadata: {
					inference_version: "0.1.1",
					detector_version: "grounding-dino",
					classifier_version: "wakareeru-0.1.1-alpha.1",
				},
				subject_count: 1,
				subjects: [
					{
						index: 0,
						detection: {
							bbox: [120, 80, 900, 520],
							status: "detected",
							label: "a train",
							score: 0.74,
						},
						classification: {
							status: "classified",
							top_prediction: prediction,
							top_k: [prediction],
							confusion_group: null,
							group_candidates: [],
						},
					},
				],
			});
		});
		vi.stubGlobal("fetch", upstreamFetch);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1, 2, 3, 4])], "train.jpg", { type: "image/jpeg" }));
		form.set("top_k", "3");

		const response = await fetchWorker(multipartRequest(form));
		const payload = await response.json<Record<string, unknown>>();

		expect(response.status).toBe(200);
		expect(payload.status).toBe("ok");
		expect(upstreamFetch).toHaveBeenCalledOnce();
	});

	it("rejects unsupported image types before calling upstream", async () => {
		const upstreamFetch = vi.fn();
		vi.stubGlobal("fetch", upstreamFetch);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1])], "photo.heic", { type: "image/heic" }));

		const response = await fetchWorker(multipartRequest(form));
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(415);
		expect(payload.error.code).toBe("unsupported_image_type");
		expect(upstreamFetch).not.toHaveBeenCalled();
	});

	it("rejects oversized images before calling upstream", async () => {
		const upstreamFetch = vi.fn();
		vi.stubGlobal("fetch", upstreamFetch);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1, 2])], "train.png", { type: "image/png" }));

		const response = await fetchWorker(multipartRequest(form), { MAX_IMAGE_BYTES: "1" });
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(413);
		expect(payload.error.code).toBe("image_too_large");
		expect(upstreamFetch).not.toHaveBeenCalled();
	});

	it("uses max image bytes from KV config", async () => {
		const upstreamFetch = vi.fn();
		vi.stubGlobal("fetch", upstreamFetch);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1, 2])], "train.png", { type: "image/png" }));

		const response = await fetchWorker(multipartRequest(form), {
			wakareeru_config: configKv({ MAX_IMAGE_BYTES: "1" }) as KVNamespace,
		});
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(413);
		expect(payload.error.code).toBe("image_too_large");
		expect(upstreamFetch).not.toHaveBeenCalled();
	});

	it("uses inference timeout from KV config", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: RequestInfo | URL, init?: RequestInit) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
					}),
			),
		);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1])], "train.webp", { type: "image/webp" }));

		const responsePromise = fetchWorker(multipartRequest(form), {
			wakareeru_config: configKv({ INFERENCE_TIMEOUT_MS: "5" }) as KVNamespace,
		});

		await vi.advanceTimersByTimeAsync(5);
		const response = await responsePromise;
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(504);
		expect(payload.error.code).toBe("upstream_timeout");
		vi.useRealTimers();
	});

	it("maps upstream failures to a gateway error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({ error: "backend exploded" }, { status: 502 }),
			),
		);

		const form = new FormData();
		form.set("image", new File([new Uint8Array([1])], "train.webp", { type: "image/webp" }));

		const response = await fetchWorker(multipartRequest(form));
		const payload = await response.json<{ error: { code: string } }>();

		expect(response.status).toBe(502);
		expect(payload.error.code).toBe("upstream_error");
	});
});
