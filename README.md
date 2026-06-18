# wakareeru-api-gateway

Cloudflare Workers API Gateway for the `wakareeru` inference backend.

The gateway owns the public REST API, request validation, auth/rate-limit boundaries, and inference backend forwarding. It does not run model inference locally and does not store or compress uploaded images in the first version.

## API

### `GET /health`

Returns gateway health:

```json
{
  "status": "ok",
  "service": "wakareeru-api-gateway",
  "request_id": "..."
}
```

### `GET /version`

Returns gateway and configured inference metadata.

### `POST /v1/infer`

Accepts `multipart/form-data`:

- `image`: required file, `image/jpeg`, `image/png`, or `image/webp`.
- `top_k`: optional integer from `1` to `20`.

The gateway converts the image bytes to base64 and forwards this payload to the configured inference endpoint:

```json
{
  "input": {
    "image_base64": "...",
    "top_k": 5
  },
  "request_context": {
    "request_id": "...",
    "client_tier": "anonymous",
    "image_content_type": "image/jpeg",
    "image_bytes": 12345
  }
}
```

Example:

```bash
curl -X POST "http://localhost:8787/v1/infer" \
  -F "image=@/path/to/train.jpg;type=image/jpeg" \
  -F "top_k=5"
```

HEIF/HEIC and large original photos should be converted or resized by the frontend before upload. The gateway rejects unsupported types and files larger than `MAX_IMAGE_BYTES`.

## Configuration

Non-secret defaults live in `wrangler.jsonc` under `vars`.

Production secrets should be configured in Cloudflare Dashboard with matching names:

```text
INFERENCE_ENDPOINT_URL
INFERENCE_API_KEY
```

`INFERENCE_ENDPOINT_URL` should be the inference backend root URL. For RunPod, use the endpoint root:

```text
https://api.runpod.ai/v2/<endpoint-id>
```

The gateway appends `INFERENCE_OPERATION_PATH`, which defaults to `/runsync`.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill the same values.

## Development

```bash
npm run dev
npm run typecheck
npm test
```

Run `npm run cf-typegen` after changing bindings or vars in `wrangler.jsonc`.
