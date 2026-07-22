import { authenticate } from "./auth/authenticator";
import { getConfig } from "./config/env";
import { applyCors, corsPreflight } from "./http/cors";
import { ApiError, errorResponse } from "./http/errors";
import { announceRoute } from "./routes/announce";
import { galleryRoute } from "./routes/gallery";
import { healthRoute } from "./routes/health";
import { inferRoute } from "./routes/infer";
import { versionRoute } from "./routes/version";
import { createRequestContext } from "./observability/requestId";
import type { AppEnv } from "./types";
import type { RuntimeConfigValues } from "./config/kv";

export async function handleRequest(
	request: Request,
	env: AppEnv,
	ctx: ExecutionContext,
	runtimeConfig: RuntimeConfigValues = {},
): Promise<Response> {
	const context = createRequestContext(request);
	const config = getConfig(env, runtimeConfig);

	try {
		if (request.method === "OPTIONS") {
			return corsPreflight(request, config);
		}

		const url = new URL(request.url);
		const principal = await authenticate(request, config);
		let response: Response;

		if (request.method === "GET" && url.pathname === "/health") {
			response = healthRoute(context);
		} else if (request.method === "GET" && url.pathname === "/version") {
			response = versionRoute(config, context);
		} else if (request.method === "GET" && url.pathname === "/announce") {
			response = announceRoute(config);
		} else if (request.method === "GET" && url.pathname === "/gallery") {
			response = galleryRoute(config);
		} else if (request.method === "POST" && url.pathname === "/v1/infer") {
			response = await inferRoute(request, env, config, principal, context);
		} else {
			throw new ApiError(404, "not_found", "Route not found.");
		}

		return applyCors(response, request, config);
	} catch (error) {
		return applyCors(errorResponse(error, context.requestId), request, config);
	}
}
