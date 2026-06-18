import type { AppEnv } from "../types";

export interface AppConfig {
	apiVersion: string;
	gatewayVersion: string;
	inferenceProvider: string;
	inferenceEndpointUrl: string | null;
	inferenceOperationPath: string;
	inferenceApiKey: string | null;
	inferenceTimeoutMs: number;
	inferenceVersionHint: string | null;
	maxImageBytes: number;
	allowedImageTypes: Set<string>;
	enableDevTokenAuth: boolean;
	enableAppleAuth: boolean;
	devTokens: Set<string>;
	allowedOrigins: string[];
}

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export function getConfig(env: AppEnv): AppConfig {
	return {
		apiVersion: env.API_VERSION || "v1",
		gatewayVersion: env.GATEWAY_VERSION || "0.1.0",
		inferenceProvider: env.INFERENCE_PROVIDER || "runpod",
		inferenceEndpointUrl: nonEmpty(env.INFERENCE_ENDPOINT_URL),
		inferenceOperationPath: normalizePath(env.INFERENCE_OPERATION_PATH || "/runsync"),
		inferenceApiKey: nonEmpty(env.INFERENCE_API_KEY),
		inferenceTimeoutMs: positiveInt(env.INFERENCE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
		inferenceVersionHint: nonEmpty(readOptional(env, "INFERENCE_VERSION_HINT")),
		maxImageBytes: positiveInt(env.MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES),
		allowedImageTypes: csvSet(env.ALLOWED_IMAGE_TYPES || DEFAULT_IMAGE_TYPES),
		enableDevTokenAuth: bool(env.ENABLE_DEV_TOKEN_AUTH),
		enableAppleAuth: bool(env.ENABLE_APPLE_AUTH),
		devTokens: csvSet(env.DEV_TOKENS || ""),
		allowedOrigins: csvList(readOptional(env, "ALLOWED_ORIGINS") || "*"),
	};
}

function readOptional(env: AppEnv, key: string): string | undefined {
	const value = (env as unknown as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

function nonEmpty(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function normalizePath(value: string): string {
	const trimmed = value.trim() || "/runsync";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function positiveInt(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined): boolean {
	return value?.toLowerCase() === "true";
}

function csvList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function csvSet(value: string): Set<string> {
	return new Set(csvList(value));
}
