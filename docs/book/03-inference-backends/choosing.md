# Choosing a Backend

## Decision Guide

Start with these questions:

**Do you have an NVIDIA GPU and want maximum throughput?**
→ Use **vLLM** or **SGLang**. They're neck-and-neck on throughput. SGLang wins when requests share a common system prompt or context. vLLM wins when requests are highly varied.

**Are you on Apple Silicon or need CPU inference?**
→ Use **llama.cpp** (via llama-swap). It has the best Metal support and GGUF quantization makes large models practical.

**Do you have an AMD GPU?**
→ Use **Ollama**. It has the most mature ROCm support.

**Do you want the easiest setup with broad hardware support?**
→ Use **Ollama**. It works everywhere, installs in one command, and handles model management well.

**Do you want to benchmark before committing?**
→ Use **Ollama** to get started, then swap to **vLLM** or **MAX** and measure. The swap is a single config line change.

---

## Comparison Table

| Feature | Ollama | vLLM | SGLang | MAX | llama.cpp |
|---------|--------|------|--------|-----|-----------|
| NVIDIA CUDA | Yes | Yes | Yes | Yes | Yes |
| AMD ROCm | Yes | Partial | No | Preview | Yes |
| Apple Silicon | Yes | No | No | No | Yes |
| CPU | Yes | No | No | No | Yes |
| Install complexity | Low | Medium | Medium | Medium | Medium |
| Python required | No | Yes | Yes | Yes | No |
| Model format | GGUF/GGML | HuggingFace | HuggingFace | HuggingFace | GGUF |
| Multi-GPU | Limited | Yes (Ray) | Yes | Planned | No |
| KV-cache reuse | No | No | Yes (Radix) | Partial | No |
| Continuous batching | Yes | Yes | Yes | Yes | Limited |
| Structured output | Limited | Yes | Yes (fast) | Partial | Yes |
| Speculative decoding | No | Yes | Yes | Planned | Yes |
| Memory efficiency | Good | Excellent | Excellent | Excellent | Good |
| Relative throughput (7B) | 1.0x | 1.4x | 1.5x | 1.5x | 0.8x |

Throughput numbers are normalized to Ollama = 1.0x for a single NVIDIA GPU. Actual results vary by model and workload.

---

## Hardware-Specific Recommendations

### NVIDIA RTX 4090 (24GB)

Best: **vLLM** or **SGLang** for production throughput. **Ollama** for easy setup or mixed workloads.

```bash
# Primary: vLLM
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-14B-Instruct \
  --port 8000

# Config
export INFERNET_BACKEND=vllm
```

### NVIDIA H100 (80GB)

Best: **vLLM** with tensor parallelism, or **MAX** for newer architectures.

```bash
# vLLM single-GPU for 70B models
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --port 8000
```

### AMD RX 7900 XTX (24GB)

Best: **Ollama** (most stable ROCm support).

```bash
infernet setup  # Ollama will be auto-selected
```

### Apple Silicon M2/M3

Best: **Ollama** for convenience, **llama.cpp** for maximum performance.

```bash
# Ollama (easiest)
ollama pull qwen2.5:14b

# llama.cpp for performance-critical nodes
llama-server \
  --model qwen2.5-14b-q4km.gguf \
  --n-gpu-layers 99 \
  --port 8080
```

### CPU Only

Best: **llama.cpp** with Q4_K_M quantization.

```bash
llama-server \
  --model qwen2.5-7b-q4km.gguf \
  --n-gpu-layers 0 \
  --threads $(nproc) \
  --port 8080
```

---

## Switching Backends

Switching is a one-line config change:

```json
{
  "backend": "vllm",
  "vllm_host": "http://localhost:8000",
  "vllm_model": "Qwen/Qwen2.5-14B-Instruct"
}
```

Then restart the daemon:

```bash
infernet service restart
# or
infernet stop && infernet start
```

The control plane is updated on the next heartbeat. No re-registration required.

---

## Benchmarking Your Setup

Before committing to a backend, benchmark it with realistic traffic:

```bash
# Install benchmark tool
pip install "sglang[benchmark]"

# Benchmark with 16 concurrent users, 512 output tokens each
python -m sglang.bench_serving \
  --backend openai \
  --base-url http://localhost:8000 \
  --model Qwen/Qwen2.5-14B-Instruct \
  --num-prompts 100 \
  --request-rate 16 \
  --output-len 512
```

Key metrics to compare:
- **Throughput (tokens/second)**: total output tokens divided by total time
- **First token latency (TTFT)**: time from request to first token — affects perceived responsiveness
- **Inter-token latency**: time between tokens in a stream — should be consistent
- **P99 latency**: worst-case latency under load
