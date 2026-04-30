# Hardware Requirements

## GPU Tiers

Infernet classifies nodes into VRAM tiers. Your tier determines which models your node can serve and how you're matched to jobs. Higher tiers get more job volume and can charge more per job.

### Tier: `>=48gb` (Flagship)

**Example hardware**: NVIDIA H100 80GB, A100 80GB, RTX 6000 Ada (48GB)

**What you can run**: 70B parameter models (Qwen2.5-72B, Llama-3.1-70B), large code models (DeepSeek Coder 33B), multi-modal models with large context windows.

**Expected throughput**: 50–150 tokens/second for 70B models. 200+ tokens/second for 7B–13B models.

**Recommended backends**: vLLM or SGLang for maximum throughput. Both support tensor parallelism if you have multiple GPUs.

### Tier: `>=24gb` (High-End Consumer / Professional)

**Example hardware**: NVIDIA RTX 4090 (24GB), RTX 3090 (24GB), A5000 (24GB)

**What you can run**: 14B–33B models at full precision, 70B models with aggressive quantization (Q4).

**Expected throughput**: 30–80 tokens/second for 14B models, 15–30 tokens/second for 33B.

**Recommended backends**: Ollama works well. vLLM for higher throughput if you're getting steady job volume.

### Tier: `>=12gb` (Mid-Range)

**Example hardware**: NVIDIA RTX 4080 (16GB), RTX 3080 (12GB), A2000 (12GB)

**What you can run**: 7B–13B models at full precision, 14B–30B with Q4 quantization.

**Expected throughput**: 40–90 tokens/second for 7B models.

**Recommended backends**: Ollama. llama.cpp if you need GGUF model support.

### Tier: `>=8gb` (Entry)

**Example hardware**: NVIDIA RTX 4060 Ti (8GB), RTX 3070 (8GB), AMD RX 6800 (16GB)

**What you can run**: 7B models at full precision, larger models with heavy quantization.

**Expected throughput**: 20–50 tokens/second for 7B models depending on memory bandwidth.

**Notes**: AMD GPUs in this tier work well with Ollama via ROCm. Apple Silicon (M1 Pro, M2) fits here too, with Ollama or llama.cpp.

### Tier: `cpu` (CPU-Only)

**What you can run**: Small models (1B–3B), heavily quantized 7B models. Not recommended for production job-taking — CPU inference is very slow for most clients.

**Best use**: Development, testing your setup, serving small specialized models (embedding models, classifiers).

---

## RAM

| GPU Tier | Minimum RAM | Recommended RAM |
|----------|-------------|-----------------|
| >=48gb   | 64 GB       | 128 GB          |
| >=24gb   | 32 GB       | 64 GB           |
| >=12gb   | 16 GB       | 32 GB           |
| >=8gb    | 16 GB       | 32 GB           |
| cpu      | 16 GB       | 32 GB           |

vLLM and SGLang manage memory aggressively and benefit from having more system RAM available for KV-cache spill. Ollama is less demanding.

---

## Storage

Model weights take significant disk space. Budget accordingly:

| Model Size | Approximate Disk (FP16) | Approximate Disk (Q4) |
|------------|-------------------------|-----------------------|
| 1B–3B      | 2–6 GB                  | 0.5–2 GB              |
| 7B         | 14 GB                   | 4 GB                  |
| 13B–14B    | 28 GB                   | 8 GB                  |
| 30B–33B    | 65 GB                   | 18 GB                 |
| 70B–72B    | 140 GB                  | 40 GB                 |

Use fast storage (NVMe SSD) for model weights. Model loading time on cold start is much faster with NVMe vs HDD or SATA SSD.

Minimum recommendations:
- **>=48gb tier**: 1 TB NVMe
- **>=24gb tier**: 500 GB NVMe
- **<=12gb tier**: 250 GB NVMe

---

## Bandwidth

Minimum: **100 Mbps** symmetric.

The bandwidth bottleneck is model downloads (one-time) and inference results (streaming). A typical streaming inference response is a few KB/second per active job. At 10 concurrent jobs, you're looking at 50–100 KB/s of upstream.

More important than raw bandwidth is **upload latency**. High-latency connections (>100ms) degrade the streaming experience for clients. Datacenter connections are strongly preferred over residential for `>=24gb` tier and above.

---

## Operating System

**Strongly recommended**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS.

The installer and daemon are tested primarily on Ubuntu. Most of the tooling in the ecosystem (NVIDIA drivers, CUDA, ROCm, Docker) has the best support on Ubuntu.

**Supported**: Debian 11+, other Debian-based distros, Fedora 38+, CentOS Stream 9.

**macOS**: Supported for development and Apple Silicon nodes. `infernet setup` works on macOS. llama.cpp and Ollama both support Metal. Production deployment on macOS is reasonable for smaller nodes.

**Windows**: Not currently supported. Use WSL2 if you need to test on Windows.

---

## GPU Drivers

Install GPU drivers **before** running `infernet setup`. The setup wizard detects your GPU via `nvidia-smi` (NVIDIA) or `rocminfo` (AMD) and will warn you if drivers are missing.

**NVIDIA**: Install the latest stable driver from [developer.nvidia.com](https://developer.nvidia.com/cuda-downloads). CUDA 12.1+ required for vLLM and SGLang. Ollama manages its own CUDA version.

**AMD**: ROCm 5.7+ for RX 6000/7000 series. Install via the official ROCm installer. Ollama has ROCm support built in.

**Apple Silicon**: No additional drivers needed. Metal is used automatically.

Quick driver check:

```bash
# NVIDIA
nvidia-smi

# AMD
rocm-smi

# Apple Silicon
system_profiler SPDisplaysDataType | grep "Metal"
```
