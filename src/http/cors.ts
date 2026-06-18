import type { AppConfig } from "../config/env";

export function corsPreflight(request: Request, config: AppConfig): Response {
	return applyCors(new Response(null, { status: 204 }), request, config);
}

export function applyCors(response: Response, request: Request, config: AppConfig): Response {
	const headers = new Headers(response.headers);
	headers.set("access-control-allow-origin", allowedOrigin(request, config));
	headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
	headers.set("access-control-allow-headers", "authorization,content-type,x-request-id");
	headers.set("access-control-max-age", "86400");
	headers.append("vary", "Origin");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function allowedOrigin(request: Request, config: AppConfig): string {
	const origin = request.headers.get("origin");
	if (!origin || config.allowedOrigins.includes("*")) {
		return "*";
	}
	return config.allowedOrigins.includes(origin) ? origin : "null";
}
