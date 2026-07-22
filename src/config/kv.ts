import type { AppEnv } from "../types";

export interface RuntimeConfigValues {
	modelVersion?: string;
	inferenceTimeoutMs?: string;
	maxImageBytes?: string;
	announcement?: JsonValue;
	galleryImageId?: string;
	galleryImageUrl?: string;
	galleryImageDescription?: GalleryImageDescription;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface GalleryImageDescription {
	"zh-CN": string;
	"ja-JP": string;
	en: string;
}

const ANNOUNCEMENT_KEY = "announcement:production";
const GALLERY_IMAGE_ID_KEY = "GALLERY_IMAGE_ID";
const GALLERY_IMAGE_URL_KEY = "GALLERY_IMAGE_URL";
const GALLERY_IMAGE_DESCRIPTION_KEY = "GALLERY_IMAGE_DESCRIPTION";
const CONFIG_KEYS = [
	"MODEL_VERSION",
	"INFERENCE_TIMEOUT_MS",
	"MAX_IMAGE_BYTES",
	ANNOUNCEMENT_KEY,
	GALLERY_IMAGE_ID_KEY,
	GALLERY_IMAGE_URL_KEY,
	GALLERY_IMAGE_DESCRIPTION_KEY,
] as const;

export async function loadRuntimeConfig(env: AppEnv): Promise<RuntimeConfigValues> {
	if (!env.wakareeru_config) {
		return {};
	}

	const values = await env.wakareeru_config.get([...CONFIG_KEYS]);

	return {
		modelVersion: nonEmpty(values.get("MODEL_VERSION")),
		inferenceTimeoutMs: nonEmpty(values.get("INFERENCE_TIMEOUT_MS")),
		maxImageBytes: nonEmpty(values.get("MAX_IMAGE_BYTES")),
		announcement: parseJson(values.get(ANNOUNCEMENT_KEY), ANNOUNCEMENT_KEY),
		galleryImageId: nonEmpty(values.get(GALLERY_IMAGE_ID_KEY)),
		galleryImageUrl: nonEmpty(values.get(GALLERY_IMAGE_URL_KEY)),
		galleryImageDescription: parseGalleryImageDescription(
			values.get(GALLERY_IMAGE_DESCRIPTION_KEY),
		),
	};
}

function parseGalleryImageDescription(
	value: string | null | undefined,
): GalleryImageDescription | undefined {
	const parsed = parseJson(value, GALLERY_IMAGE_DESCRIPTION_KEY);
	if (parsed === undefined) {
		return undefined;
	}

	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
		const zhCN = nonEmptyString(parsed["zh-CN"]);
		const jaJP = nonEmptyString(parsed["ja-JP"]);
		const en = nonEmptyString(parsed.en);
		if (zhCN && jaJP && en) {
			return { "zh-CN": zhCN, "ja-JP": jaJP, en };
		}
	}

	console.error(
		JSON.stringify({
			message: "Invalid gallery image description in runtime configuration",
			key: GALLERY_IMAGE_DESCRIPTION_KEY,
		}),
	);
	return undefined;
}

function nonEmpty(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function nonEmptyString(value: JsonValue | undefined): string | undefined {
	return typeof value === "string" ? nonEmpty(value) : undefined;
}

function parseJson(value: string | null | undefined, key: string): JsonValue | undefined {
	const normalized = nonEmpty(value);
	if (!normalized) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(normalized);
		if (isJsonValue(parsed)) {
			return parsed;
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "Invalid JSON in runtime configuration",
				key,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return undefined;
	}

	console.error(JSON.stringify({ message: "Invalid JSON value in runtime configuration", key }));
	return undefined;
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	if (typeof value === "object") {
		return Object.values(value).every(isJsonValue);
	}
	return false;
}
