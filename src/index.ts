import { handleRequest } from "./app";
import type { AppEnv } from "./types";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleRequest(request, env, ctx);
	},
} satisfies ExportedHandler<AppEnv>;
