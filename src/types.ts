export type AppEnv = Env & {
	INFERENCE_ENDPOINT_URL?: string;
	INFERENCE_API_KEY?: string;
	INFERENCE_OPERATION_PATH?: string;
	DEV_TOKENS?: string;
	ANON_INFER_RATE_LIMITER?: RateLimitBinding;
	USER_INFER_RATE_LIMITER?: RateLimitBinding;
	DEV_INFER_RATE_LIMITER?: RateLimitBinding;
};

export interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RequestContext {
	requestId: string;
	startedAt: number;
}
