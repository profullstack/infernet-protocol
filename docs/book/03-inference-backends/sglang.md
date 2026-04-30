# SGLang

SGLang (Structured Generation Language) is an inference engine that focuses on KV-cache reuse and structured output generation. It's particularly efficient when many requests share common prompt prefixes — a common pattern in chatbots with a shared system prompt.

## Requirements

- NVIDIA GPU with CUDA 12.1+
- Python 3.9+
- 16 GB+ VRAM recommended

## Installing SGLang

```bash
pip install "sglang[all]"
```

Or with a specific CUDA version:

```bash
pip install "sglang[all]" --find-links https://flashinfer.ai/whl/cu121/torch2.4/
```

Using Docker:

```bash
docker pull lmsys/sglang:latest
```

## Starting SGLang

SGLang also exposes an OpenAI-compatible API:

```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --host 0.0.0.0 \
  --port 30000 \
  --served-model-name qwen2.5:14b

# With Docker
docker run --gpus all --rm \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 30000:30000 \
  lmsys/sglang:latest \
  python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --port 30000
```

Test:

```bash
curl http://localhost:30000/health
# {"status":"ok"}
```

## RadixAttention: KV-Cache Reuse

SGLang's standout feature is RadixAttention. It organizes the KV-cache as a radix tree, where the tree edges represent token sequences. When two requests share a common prefix (e.g., the same system prompt), SGLang reuses the computed KV-cache for that prefix rather than recomputing it.

In practice, this means:

- System prompts are computed once and cached, not once per request
- Multi-turn conversations benefit because earlier turns are already cached
- RAG applications that prepend the same documents to many queries see dramatic speedups

For a workload where 80% of requests share the same 500-token system prompt, RadixAttention can reduce total computation by 40–60%.

You don't need to enable it — RadixAttention is on by default. The cache size is configurable:

```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --max-prefill-tokens 16384 \
  --mem-fraction-static 0.85
```

`--mem-fraction-static` controls what fraction of GPU memory is reserved for the KV-cache (vs model weights). Higher values give more cache capacity.

## Speculative Decoding

SGLang supports speculative decoding, which uses a small draft model to generate candidate tokens and a larger verifier model to accept/reject them. This can increase token throughput by 2–3x with minimal quality loss.

```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --speculative-draft-model-path Qwen/Qwen2.5-1.5B-Instruct \
  --speculative-num-draft-tokens 4 \
  --port 30000
```

The draft model must be from the same model family and small enough that draft generation is cheap. A 7B verifier with a 1.5B draft is a common pairing.

## Structured Output

SGLang's native structured output is more efficient than the schema-enforcement approaches used by other backends, because it constrains the sampling process rather than post-filtering:

```bash
curl http://localhost:30000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:14b",
    "messages": [{"role": "user", "content": "Extract the name and age from: John Smith is 32 years old."}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "person",
        "schema": {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "age": {"type": "integer"}
          },
          "required": ["name", "age"]
        }
      }
    }
  }'
```

## Multi-GPU

```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-72B-Instruct \
  --tp 4 \
  --port 30000
```

`--tp` is the tensor parallelism degree. Use `--dp` for data parallelism (multiple model replicas):

```bash
# 2 replicas, each on 2 GPUs (4 GPUs total)
python -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --tp 2 \
  --dp 2 \
  --port 30000
```

## Key Environment Variables

```bash
# SGLang server address
SGLANG_HOST=http://localhost:30000

# Default model
SGLANG_MODEL=Qwen/Qwen2.5-14B-Instruct

# HuggingFace token
HF_TOKEN=hf_your_token_here

# CUDA device selection
CUDA_VISIBLE_DEVICES=0
```

## Infernet Config

```json
{
  "backend": "sglang",
  "sglang_host": "http://localhost:30000",
  "sglang_model": "Qwen/Qwen2.5-14B-Instruct"
}
```

## When SGLang Wins vs vLLM

SGLang tends to outperform vLLM when:
- Requests share long common prefixes (system prompts, RAG context)
- You're serving structured output with JSON schemas
- You're doing multi-step reasoning chains with shared context

vLLM tends to win when:
- Requests are highly varied with no shared prefix
- You need the broadest model support (vLLM supports more exotic architectures)
- You're already invested in vLLM tooling

For most Infernet workloads (chat with a consistent system prompt), SGLang and vLLM are competitive. Run a benchmark against your actual workload to decide.

## Systemd Service

```ini
[Unit]
Description=SGLang Inference Server
After=network.target

[Service]
Type=simple
User=infernet
ExecStart=/usr/bin/python3 -m sglang.launch_server \
  --model-path Qwen/Qwen2.5-14B-Instruct \
  --host 0.0.0.0 \
  --port 30000 \
  --served-model-name qwen2.5:14b
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
