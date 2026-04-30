# Chapter 4: Building Apps

This chapter is for developers building applications on top of Infernet Protocol. You don't need to run a node — you submit jobs to the network via a REST API and get inference results back.

---

## In This Chapter

- [API Overview](api-overview.md) — Base URL, authentication, and the core endpoints. Everything you need to make your first API call.
- [Streaming Chat](streaming-chat.md) — How to consume SSE token streams in JavaScript and Python. Handling done events and errors.
- [Job Lifecycle](job-lifecycle.md) — Job states, polling vs streaming, retry logic, and what to do when jobs fail.

---

## The Developer's View

From a developer's perspective, Infernet Protocol looks like a standard LLM API — similar to OpenAI's API — but backed by a decentralized network of GPU nodes. You submit a prompt, specify a model, and get tokens back. The routing, node selection, and payment happen under the hood.

The key differences from a centralized provider:

1. **Model availability varies**: nodes on the network serve different models. If you request a model that no node currently has loaded, the job will queue until a node with that model is available — or fail with `no_capacity` if none are registered.

2. **Streaming is the default**: because responses come from distributed nodes, streaming is the most reliable way to get results. Polling a job ID also works but adds latency.

3. **Auth uses bearer tokens from the dashboard**: you get a bearer token by creating an API key in the [Infernet Dashboard](https://app.infernet.sh). This token identifies your account for billing and rate limiting.

---

## Quick API Test

```bash
# Set your token
export INFERNET_BEARER_TOKEN="your_token_here"

# Submit a job
curl https://app.infernet.sh/api/v1/jobs \
  -H "Authorization: Bearer $INFERNET_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "What is 2 + 2?"}],
    "stream": false
  }'
```

You should get back a JSON response with the job result in under a few seconds.
