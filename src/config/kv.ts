import type { AppEnv } from "../types";

export interface RuntimeConfigValues {
	modelVersion?: string;
	inferenceTimeoutMs?: string;
	maxImageBytes?: string;
	announcement?: JsonValue;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const ANNOUNCEMENT_KEY = "announcement:production";
const CONFIG_KEYS = [
	"MODEL_VERSION",
	"INFERENCE_TIMEOUT_MS",
	"MAX_IMAGE_BYTES",
	ANNOUNCEMENT_KEY,
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
	};
}

function nonEmpty(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
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
