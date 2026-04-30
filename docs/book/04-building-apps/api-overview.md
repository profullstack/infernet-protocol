# API Overview

## Base URL

All API requests go to the control plane:

```
https://app.infernet.sh/api/v1
```

If you're self-hosting the control plane, replace this with your own URL.

## Authentication

All requests require a bearer token:

```
Authorization: Bearer your_token_here
```

Get a token by creating an API key in the [Infernet Dashboard](https://app.infernet.sh) under **Settings → API Keys**.

Tokens are scoped to your account. Rate limits and billing are tracked per token.

## Core Endpoints

### POST /api/v1/jobs

Submit an inference job.

**Request:**

```json
{
  "model": "qwen2.5:14b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "max_tokens": 256,
  "temperature": 0.7,
  "stream": false
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., `qwen2.5:14b`) |
| `messages` | array | Yes | Chat messages in OpenAI format |
| `max_tokens` | integer | No | Maximum output tokens (default: 512) |
| `temperature` | float | No | Sampling temperature 0.0–2.0 (default: 0.7) |
| `top_p` | float | No | Nucleus sampling (default: 1.0) |
| `stream` | boolean | No | Return SSE stream immediately (default: false) |
| `node_id` | string | No | Pin to a specific node (advanced) |

**Response (stream: false):**

```json
{
  "id": "job_9a3f2c1d",
  "status": "pending",
  "model": "qwen2.5:14b",
  "created_at": "2026-04-30T14:23:41Z"
}
```

When `stream: true`, the response is an SSE stream directly. See [Streaming Chat](streaming-chat.md).

**Example:**

```bash
curl https://app.infernet.sh/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:14b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

---

### GET /api/v1/jobs/:id

Get job status and result.

**Response (pending):**

```json
{
  "id": "job_9a3f2c1d",
  "status": "pending",
  "model": "qwen2.5:14b",
  "created_at": "2026-04-30T14:23:41Z"
}
```

**Response (completed):**

```json
{
  "id": "job_9a3f2c1d",
  "status": "completed",
  "model": "qwen2.5:14b",
  "node_id": "node_8f3a2c1d",
  "result": {
    "content": "Paris is the capital of France.",
    "usage": {
      "prompt_tokens": 24,
      "completion_tokens": 8,
      "total_tokens": 32
    }
  },
  "created_at": "2026-04-30T14:23:41Z",
  "completed_at": "2026-04-30T14:23:43Z",
  "latency_ms": 2041
}
```

**Response (failed):**

```json
{
  "id": "job_9a3f2c1d",
  "status": "failed",
  "error": "no_capacity",
  "error_message": "No nodes available with model qwen2.5:14b",
  "created_at": "2026-04-30T14:23:41Z"
}
```

---

### GET /api/v1/jobs/:id/stream

Open an SSE stream to receive tokens as they're generated. This is the recommended way to deliver results in real-time applications.

See [Streaming Chat](streaming-chat.md) for full documentation.

---

### GET /api/v1/models

List models currently available on the network (at least one online node has the model loaded).

**Response:**

```json
{
  "models": [
    {
      "id": "qwen2.5:72b",
      "nodes": 3,
      "avg_tokens_per_second": 48
    },
    {
      "id": "qwen2.5:14b",
      "nodes": 12,
      "avg_tokens_per_second": 78
    },
    {
      "id": "qwen2.5:7b",
      "nodes": 28,
      "avg_tokens_per_second": 95
    },
    {
      "id": "llama3.2:3b",
      "nodes": 15,
      "avg_tokens_per_second": 130
    }
  ]
}
```

Use this to check availability before submitting a job, especially for large models.

---

### GET /api/v1/jobs

List your recent jobs.

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 20 | Number of jobs to return (max 100) |
| `status` | all | Filter by status: `pending`, `processing`, `completed`, `failed` |
| `since` | — | ISO8601 timestamp to filter from |

**Example:**

```bash
curl "https://app.infernet.sh/api/v1/jobs?limit=10&status=completed" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error Responses

All errors return a JSON body with `error` and `error_message`:

```json
{
  "error": "unauthorized",
  "error_message": "Invalid or expired bearer token"
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `unauthorized` | 401 | Missing or invalid token |
| `bad_request` | 400 | Missing required field or invalid parameter |
| `model_not_found` | 404 | Model is not registered on the network |
| `no_capacity` | 503 | Model exists but no nodes have capacity |
| `rate_limited` | 429 | Too many requests; back off and retry |
| `internal_error` | 500 | Something went wrong on our end |

## Rate Limits

Default rate limits for API tokens:

- 60 requests per minute
- 1000 requests per hour
- Limits are per token, not per IP

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1746020400
```

When rate limited, you'll receive HTTP 429. The `Retry-After` header tells you when to retry:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 13
```
