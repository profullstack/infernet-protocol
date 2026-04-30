# Chapter 3: Inference Backends

Infernet Protocol supports five inference backends. The daemon auto-detects which one to use, but understanding your options lets you pick the right tool for your hardware and workload.

---

## In This Chapter

- [Ollama](ollama.md) — The default. Easy setup, broad hardware support (NVIDIA, AMD, Apple Silicon, CPU).
- [vLLM](vllm.md) — High throughput on NVIDIA hardware. Best for nodes with heavy job volume.
- [SGLang](sglang.md) — KV-cache reuse and structured output. Best when clients use similar prompt prefixes.
- [Modular MAX](max.md) — High throughput with a different memory management approach. Competitive with vLLM.
- [llama.cpp](llamacpp.md) — No Python dependency. CPU and Apple Silicon native. GGUF model format.
- [Choosing a Backend](choosing.md) — Decision guide with a comparison table.

---

## How Auto-Selection Works

At startup, the daemon probes each backend in priority order by sending a health check request. The first backend that responds is used.

Default probe order:
1. Ollama (`localhost:11434/api/tags`)
2. vLLM (`localhost:8000/health`)
3. SGLang (`localhost:30000/health`)
4. Modular MAX (`localhost:8080/health`)
5. llama.cpp / llama-swap (`localhost:8080/health`)

Override the selection with an env var:

```bash
export INFERNET_BACKEND=vllm
infernet start
```

Or in your config:

```json
{
  "backend": "vllm"
}
```

---

## Backend Adapter Interface

All backends speak to the daemon through a common adapter interface:

- `POST /generate` — single inference request
- `POST /generate/stream` — streaming inference request
- `GET /models` — list loaded models
- `GET /health` — health check

The daemon translates between this interface and each backend's native API. You don't need to know the backend's native API unless you're doing advanced configuration.
