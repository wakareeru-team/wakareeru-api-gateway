import type { AppConfig } from "../config/env";
import { ApiError } from "../http/errors";

export function announceRoute(config: AppConfig): Response {
	if (config.announcement === undefined) {
		throw new ApiError(404, "announcement_not_found", "No announcement is configured.");
	}

	return Response.json(config.announcement);
}
