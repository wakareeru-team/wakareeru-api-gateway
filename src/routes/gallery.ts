import type { AppConfig } from "../config/env";
import { ApiError } from "../http/errors";

export function galleryRoute(config: AppConfig): Response {
	if (
		config.galleryImageId === null ||
		config.galleryImageUrl === null ||
		config.galleryImageDescription === null
	) {
		throw new ApiError(404, "gallery_not_found", "No gallery image is configured.");
	}

	return Response.json({
		schemaVersion: 1,
		image: {
			id: config.galleryImageId,
			url: config.galleryImageUrl,
			description: config.galleryImageDescription,
		},
	});
}
