import type { AppConfig } from "../config/env";
import { ApiError } from "../http/errors";

export interface UploadedImage {
	fileName: string;
	contentType: string;
	size: number;
	base64: string;
}

export interface InferenceFormFields {
	image: UploadedImage;
	topK: number | null;
}

export async function parseInferenceMultipart(
	request: Request,
	config: AppConfig,
): Promise<InferenceFormFields> {
	const contentType = request.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("multipart/form-data")) {
		throw new ApiError(
			400,
			"invalid_multipart",
			"Expected multipart/form-data with an image file.",
		);
	}

	const formData = await request.formData();
	const imageField = formData.get("image");
	if (!(imageField instanceof File)) {
		throw new ApiError(400, "missing_image", "Expected multipart field 'image' to be a file.");
	}

	const contentTypeFromFile = normalizeContentType(imageField.type);
	if (!config.allowedImageTypes.has(contentTypeFromFile)) {
		throw new ApiError(
			415,
			"unsupported_image_type",
			"Please upload JPEG, PNG, or WebP. HEIF images should be converted before upload.",
			{ content_type: contentTypeFromFile || "unknown" },
		);
	}

	if (imageField.size <= 0) {
		throw new ApiError(400, "empty_image", "Image file must not be empty.");
	}
	if (imageField.size > config.maxImageBytes) {
		throw new ApiError(413, "image_too_large", "Image file is too large.", {
			max_image_bytes: config.maxImageBytes,
			image_bytes: imageField.size,
		});
	}

	return {
		image: {
			fileName: imageField.name,
			contentType: contentTypeFromFile,
			size: imageField.size,
			base64: arrayBufferToBase64(await imageField.arrayBuffer()),
		},
		topK: parseTopK(formData.get("top_k")),
	};
}

function normalizeContentType(value: string): string {
	return value.toLowerCase().split(";")[0]?.trim() || "";
}

function parseTopK(value: string | File | null): number | null {
	if (value === null || value instanceof File || value === "") {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
		throw new ApiError(400, "invalid_top_k", "top_k must be an integer between 1 and 20.");
	}
	return parsed;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}
