import type { Principal } from "../auth/principal";
import { ApiError } from "../http/errors";
import type { AppEnv } from "../types";

export async function enforceInferenceRateLimit(env: AppEnv, principal: Principal): Promise<void> {
	const binding =
		principal.tier === "developer"
			? env.DEV_INFER_RATE_LIMITER
			: principal.tier === "user"
				? env.USER_INFER_RATE_LIMITER
				: env.ANON_INFER_RATE_LIMITER;

	if (!binding) {
		return;
	}

	const result = await binding.limit({ key: `${principal.tier}:${principal.id}` });
	if (!result.success) {
		throw new ApiError(429, "rate_limited", "Too many inference requests.");
	}
}
