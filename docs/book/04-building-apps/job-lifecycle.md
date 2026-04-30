# Job Lifecycle

## States

A job moves through these states:

```
pending → processing → completed
                    ↘ failed
```

| State | Description |
|-------|-------------|
| `pending` | Job submitted, waiting for a node to accept it |
| `processing` | A node has accepted the job and is running inference |
| `completed` | Inference finished successfully, result available |
| `failed` | Job failed permanently (see error codes) |

There's no `cancelled` state — jobs cannot be cancelled once submitted.

## Polling

For non-streaming use cases, poll the job status endpoint until the job is complete:

```javascript
async function waitForJob(jobId, token, pollIntervalMs = 500) {
  const url = `https://infernetprotocol.com/api/v1/jobs/${jobId}`;
  
  while (true) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const job = await response.json();
    
    if (job.status === 'completed') {
      return job.result.content;
    }
    
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error} — ${job.error_message}`);
    }
    
    // Still pending or processing
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

// Usage
const jobResponse = await fetch('https://infernetprotocol.com/api/v1/jobs', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'qwen2.5:14b',
    messages: [{ role: 'user', content: 'What is 2 + 2?' }],
    stream: false,
  }),
});
const { id } = await jobResponse.json();
const result = await waitForJob(id, TOKEN);
```

For Python:

```python
import time
import httpx

def wait_for_job(job_id: str, token: str, poll_interval: float = 0.5) -> str:
    url = f"https://infernetprotocol.com/api/v1/jobs/{job_id}"
    headers = {"Authorization": f"Bearer {token}"}
    
    with httpx.Client() as client:
        while True:
            job = client.get(url, headers=headers).json()
            
            if job["status"] == "completed":
                return job["result"]["content"]
            
            if job["status"] == "failed":
                raise RuntimeError(f"Job failed: {job['error']} — {job['error_message']}")
            
            time.sleep(poll_interval)
```

## Polling vs Streaming

| Consideration | Polling | Streaming |
|---------------|---------|-----------|
| Implementation complexity | Low | Medium |
| Time-to-first-byte | Full generation time | ~1 second |
| UX for end users | Spinner until done | Tokens appear live |
| Network usage | Multiple requests | Single long connection |
| Reliability under unstable connections | Better (can resume polling) | Requires reconnection |
| Good for | Batch processing, server-to-server | User-facing chat, demos |

For batch processing or backend jobs where a human isn't watching, polling is fine. For any user-facing interface, streaming is strongly preferred.

## Timeouts

Jobs have a server-side timeout of **5 minutes**. If a job is still in `pending` or `processing` state after 5 minutes, it will transition to `failed` with `error: "timeout"`.

This covers cases where a node accepts a job but then goes offline. The control plane detects the missed heartbeat, marks the node offline, and re-queues the job on a different node — all transparently.

Set a client-side timeout somewhat longer to allow for re-queue time:

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000); // 6 min

try {
  const response = await fetch('https://infernetprotocol.com/api/v1/jobs', {
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeoutId);
}
```

## Retry Logic

Not all failures are permanent. Implement exponential backoff for transient errors:

```javascript
const RETRYABLE_ERRORS = ['no_capacity', 'node_disconnected', 'internal_error'];

async function submitWithRetry(payload, token, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const response = await fetch('https://infernetprotocol.com/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      const data = await response.json();
      
      if (response.ok) return data;
      
      lastError = data;
      
      if (!RETRYABLE_ERRORS.includes(data.error)) {
        throw new Error(`Non-retryable error: ${data.error_message}`);
      }
      
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  
  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.error_message || lastError?.message}`);
}
```

## Error Reference

| Error | Retryable | Cause | Action |
|-------|-----------|-------|--------|
| `no_capacity` | Yes | No node available with this model | Retry with backoff; consider different model |
| `model_not_found` | No | Model not registered on network | Check model name spelling; use `/api/v1/models` |
| `unauthorized` | No | Invalid bearer token | Refresh token in dashboard |
| `rate_limited` | Yes | Too many requests | Respect `Retry-After` header |
| `bad_request` | No | Invalid parameters | Fix request payload |
| `node_disconnected` | Yes | Node went offline during streaming | Retry full job |
| `timeout` | Yes | Job exceeded 5 minute limit | Retry; consider smaller context |
| `internal_error` | Yes | Unexpected server error | Retry with backoff |

## Pending Time

The time a job spends in `pending` depends on network load and model availability. For popular models (qwen2.5:7b, llama3.2:3b), jobs typically start within 1–3 seconds. For rare or large models, pending time can be longer if all nodes with that model are busy.

You can check how many nodes are available for a model before submitting:

```javascript
const models = await fetch('https://infernetprotocol.com/api/v1/models', {
  headers: { 'Authorization': `Bearer ${TOKEN}` },
}).then(r => r.json());

const modelInfo = models.models.find(m => m.id === 'qwen2.5:14b');
if (modelInfo && modelInfo.nodes > 0) {
  // Nodes available, low wait time
  console.log(`${modelInfo.nodes} nodes available`);
} else {
  console.log('Model not available or no capacity');
}
```

## Batch Processing

For high-volume batch processing, submit multiple jobs in parallel and poll them concurrently:

```javascript
async function batchInference(prompts, model, token) {
  // Submit all jobs
  const jobIds = await Promise.all(
    prompts.map(prompt =>
      fetch('https://infernetprotocol.com/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      })
      .then(r => r.json())
      .then(j => j.id)
    )
  );
  
  // Poll all until complete
  return Promise.all(jobIds.map(id => waitForJob(id, token)));
}

const results = await batchInference(
  ['What is 2+2?', 'What is the capital of France?', 'Who wrote Hamlet?'],
  'qwen2.5:7b',
  TOKEN
);
```

Rate limits apply per token. For large batches, use the rate limit headers to stay within bounds.
