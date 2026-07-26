export interface InferenceRequest {
	input: {
		image_base64: string;
		top_k?: number;
		inference_options?: {
			detection_threshold?: number;
			nms_iou_threshold?: number;
			fallback_to_whole_image?: boolean;
		};
	};
	request_context: {
		request_id: string;
		client_tier: string;
		image_content_type: string;
		image_bytes: number;
	};
}

export type InferenceResponse = unknown;
