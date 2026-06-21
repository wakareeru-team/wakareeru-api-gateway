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
		...overrides,
	} as AppEnv;
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
