import type { Principal } from "../auth/principal";
import type { AppConfig } from "../config/env";
import { ApiError } from "../http/errors";
import type { RequestContext } from "../types";
import type { UploadedImage } from "../uploads/multipart";
import type { InferenceRequest, InferenceResponse } from "./types";

export async function infer(
	config: AppConfig,
	image: UploadedImage,
	topK: number | null,
	principal: Principal,
	context: RequestContext,
): Promise<InferenceResponse> {
	if (!config.inferenceEndpointUrl) {
		throw new ApiError(503, "inference_not_configured", "Inference endpoint is not configured.");
	}
	const inferenceOptions: NonNullable<InferenceRequest["input"]["inference_options"]> = {};
	if (config.detectionThreshold !== undefined) {
		inferenceOptions.detection_threshold = config.detectionThreshold;
	}
	if (config.nmsIouThreshold !== undefined) {
		inferenceOptions.nms_iou_threshold = config.nmsIouThreshold;
	}
	if (config.detectionFallbackToWholeImage !== undefined) {
		inferenceOptions.fallback_to_whole_image = config.detectionFallbackToWholeImage;
	}

	const payload: InferenceRequest = {
		input: {
			image_base64: image.base64,
			...(topK === null ? {} : { top_k: topK }),
			...(Object.keys(inferenceOptions).length === 0
				? {}
				: { inference_options: inferenceOptions }),
		},
		request_context: {
			request_id: context.requestId,
			client_tier: principal.tier,
			image_content_type: image.contentType,
			image_bytes: image.size,
		},
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.inferenceTimeoutMs);

	try {
		const response = await fetch(inferenceRequestUrl(config), {
			method: "POST",
			headers: inferenceHeaders(config),
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		const responseText = await response.text();
		const responseBody = parseJson(responseText);

		if (!response.ok) {
			throw new ApiError(response.status, "upstream_error", "Inference backend returned an error.", {
				upstream_status: response.status,
				upstream_body: responseBody,
			});
		}

		return responseBody;
	} catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new ApiError(504, "upstream_timeout", "Inference backend timed out.");
		}
		throw new ApiError(502, "upstream_fetch_failed", "Failed to call inference backend.");
	} finally {
		clearTimeout(timeout);
	}
}

function inferenceRequestUrl(config: AppConfig): string {
	const baseUrl = config.inferenceEndpointUrl;
	if (!baseUrl) {
		throw new ApiError(503, "inference_not_configured", "Inference endpoint is not configured.");
	}
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	return `${normalizedBase}${config.inferenceOperationPath}`;
}

function inferenceHeaders(config: AppConfig): Headers {
	const headers = new Headers({
		"content-type": "application/json",
		accept: "application/json",
	});
	if (config.inferenceApiKey) {
		headers.set("authorization", `Bearer ${config.inferenceApiKey}`);
	}
	return headers;
}

function parseJson(value: string): unknown {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
