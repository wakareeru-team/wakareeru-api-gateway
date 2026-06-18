export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function errorResponse(error: unknown, requestId: string): Response {
	if (error instanceof ApiError) {
		return Response.json(
			{
				error: {
					code: error.code,
					message: error.message,
					request_id: requestId,
					...(error.details === undefined ? {} : { details: error.details }),
				},
			},
			{ status: error.status },
		);
	}

	console.error("Unhandled gateway error", error);
	return Response.json(
		{
			error: {
				code: "internal_error",
				message: "Internal gateway error.",
				request_id: requestId,
			},
		},
		{ status: 500 },
	);
}
