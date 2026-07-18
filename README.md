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

```json
{
  "gateway_version": "0.1.1",
  "api_version": "v1",
  "model_version": "0.1.1-alpha.1",
  "inference_provider": "runpod",
  "inference_operation_path": "/runsync",
  "inference_version_hint": null,
  "request_id": "..."
}
```

### `GET /announce`

Returns the current production announcement document stored in KV. The JSON is passed through
without an additional response wrapper.

```json
{
  "schemaVersion": 1,
  "announcements": [
    {
      "id": "alpha-welcome-20260718",
      "priority": 100,
      "enabled": true,
      "title": {
        "zh-Hans": "欢迎参加 Alpha 测试",
        "en": "Welcome to the Alpha Test",
        "ja": "アルファテストへようこそ"
      },
      "body": {
        "zh-Hans": "Wakareeru 目前处于早期测试阶段，识别结果可能不准确。",
        "en": "Wakareeru is currently in an early testing stage. Recognition results may be inaccurate.",
        "ja": "Wakareeruは現在初期テスト段階です。認識結果が正確でない場合があります。"
      }
    }
  ]
}
```

Payload conventions:

- `schemaVersion` identifies the document format. Clients should ignore unsupported versions.
- `id` is a stable, unique announcement identifier that clients may use for dismissal state.
- `enabled: false` means the client should not display the announcement.
- Higher `priority` values should be displayed first.
- `title` and `body` use language tags such as `zh-Hans`, `en`, and `ja`.

The gateway does not filter, sort, or localize announcements; those fields are delivered exactly as
stored so clients can apply their own display policy.

Returns `404 announcement_not_found` when the KV key is missing or empty.

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

The inference response is passed through unchanged. Classification labels and operators are localized for Japanese, English, and Chinese. Each operator language is always an array, including when there is only one operator.

```json
{
  "status": "ok",
  "metadata": {
    "inference_version": "0.1.1",
    "detector_version": "grounding-dino",
    "classifier_version": "wakareeru-0.1.1-alpha.1"
  },
  "subject_count": 1,
  "subjects": [
    {
      "index": 0,
      "detection": {
        "bbox": [120, 80, 900, 520],
        "status": "detected",
        "label": "a train",
        "score": 0.74
      },
      "classification": {
        "status": "classified",
        "top_prediction": {
          "label_id": 0,
          "label": {
            "ja": "101系",
            "en": "101 series",
            "zh": "101系"
          },
          "operator": {
            "ja": ["国鉄"],
            "en": ["Japanese National Railways"],
            "zh": ["日本国有铁道"]
          },
          "probability": 0.8
        },
        "top_k": [
          {
            "label_id": 0,
            "label": {
              "ja": "101系",
              "en": "101 series",
              "zh": "101系"
            },
            "operator": {
              "ja": ["国鉄"],
              "en": ["Japanese National Railways"],
              "zh": ["日本国有铁道"]
            },
            "probability": 0.8
          }
        ],
        "confusion_group": null,
        "group_candidates": []
      }
    }
  ]
}
```

Top-level response statuses are `ok`, `no_detection`, and `error`. Detection statuses are `detected` and `fallback_whole_image`; classification statuses are `classified`, `low_confidence`, and `no_prediction`.

Example:

```bash
curl -X POST "http://localhost:8787/v1/infer" \
  -F "image=@/path/to/train.jpg;type=image/jpeg" \
  -F "top_k=5"
```

Or use the helper script:

```bash
cp test/infer.config.example.json test/infer.config.json
npm run infer -- --target local
npm run infer -- --target production --count 10
```

HEIF/HEIC and large original photos should be converted or resized by the frontend before upload. The gateway rejects unsupported types and files larger than `MAX_IMAGE_BYTES`.

## Configuration

Non-secret defaults live in `wrangler.jsonc` under `vars`.

Runtime inference settings are read from the `wakareeru_config` KV namespace:

```text
MODEL_VERSION
INFERENCE_TIMEOUT_MS
MAX_IMAGE_BYTES
announcement:production
```

`announcement:production` must contain valid JSON using the announcement document shape shown
above. The gateway currently validates JSON syntax and value types, but does not enforce the
announcement fields. Invalid JSON is ignored and logged as a runtime configuration error.

Workers KV is eventually consistent, so an announcement update may take up to 60 seconds to become
visible in every location. See [KV read consistency](https://developers.cloudflare.com/kv/api/read-key-value-pairs/).

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
