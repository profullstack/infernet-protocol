# Multi-GPU Inference

Running models larger than your single GPU's VRAM requires splitting them across multiple GPUs. vLLM with Ray is the primary tool for this on Infernet.

## When You Need Multi-GPU

| Model | Min VRAM (Q4) | Min VRAM (FP16) |
|-------|--------------|-----------------|
| Qwen2.5-72B | 38 GB | 144 GB |
| Llama-3.1-70B | 37 GB | 140 GB |
| DeepSeek-V2 (236B MoE) | 130 GB (active) | — |
| Mixtral 8x7B | 26 GB | 87 GB |

For Qwen2.5-72B at Q4, you need either one 48GB+ GPU (H100, A100 80GB, or RTX 6000 Ada) or two 24GB GPUs (2x RTX 4090 or 2x RTX 3090).

## Tensor Parallelism with vLLM + Ray

Tensor parallelism splits each transformer layer's weight matrices across GPUs. Every GPU participates in every token, and they communicate via NVLink or PCIe to exchange partial results.

### Setup

Install Ray:

```bash
pip install ray
```

Start a single-machine Ray cluster (for multi-GPU on one machine):

```bash
ray start --head --num-gpus=$(nvidia-smi --list-gpus | wc -l)
```

Verify Ray sees all GPUs:

```bash
ray status
```

```
Resources
---------------------------------------------------------------
Usage:
 0.0/64.0 CPU
 0.0/4.0 GPU
 0B/503.48GiB memory
 ...
```

### Running vLLM with Tensor Parallelism

```bash
# 2 GPUs: 2x RTX 4090 → 48GB total → can run Qwen2.5-72B Q4
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 2 \
  --host 0.0.0.0 \
  --port 8000 \
  --gpu-memory-utilization 0.92

# 4 GPUs: 4x RTX 4090 → 96GB → can run Qwen2.5-72B FP16
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 4 \
  --host 0.0.0.0 \
  --port 8000

# 8 GPUs
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 8 \
  --host 0.0.0.0 \
  --port 8000
```

vLLM will automatically use Ray for inter-GPU communication. You don't need to manage Ray workers manually for single-machine setups.

### Selecting Specific GPUs

```bash
# Use GPUs 0 and 1 only
CUDA_VISIBLE_DEVICES=0,1 python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 2 \
  --port 8000
```

## Pipeline Parallelism

Pipeline parallelism splits the model's layers across GPUs — GPU 0 runs layers 0–20, GPU 1 runs layers 21–40, etc. Unlike tensor parallelism, GPUs process the model sequentially rather than in parallel.

**When to use pipeline parallelism:**
- GPUs are connected via PCIe (not NVLink) — lower bandwidth, tensor parallelism suffers more
- You have more GPUs than needed for tensor parallelism and want to increase batch size

```bash
# Tensor + pipeline parallelism combined
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 2 \
  --pipeline-parallel-size 2 \
  --port 8000
# Total GPUs used: 2 × 2 = 4
```

## Multi-Machine with Ray

For models requiring more VRAM than a single machine can provide, Ray can be extended across multiple machines via the network.

### Start Ray Cluster

On the head node:

```bash
ray start --head \
  --port 6379 \
  --num-gpus=$(nvidia-smi --list-gpus | wc -l)
```

On each worker node (replace `HEAD_IP` with the head node's IP):

```bash
ray start \
  --address=HEAD_IP:6379 \
  --num-gpus=$(nvidia-smi --list-gpus | wc -l)
```

Verify the cluster:

```bash
ray status
# Should show combined GPUs from all nodes
```

### Run vLLM on the Cluster

From the head node:

```bash
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-72B-Instruct \
  --tensor-parallel-size 8 \  # 8 GPUs across 2 machines with 4 each
  --host 0.0.0.0 \
  --port 8000
```

vLLM will distribute the work across all Ray workers automatically.

**Network requirements for multi-machine Ray:** The machines need fast, low-latency networking between them. NVLink or InfiniBand are ideal; 10Gbps Ethernet works for pipeline parallelism but will bottleneck tensor parallelism. 1Gbps Ethernet is not sufficient.

## Infernet Config for Multi-GPU

The Infernet daemon doesn't need to know about the multi-GPU setup — it just talks to vLLM's API endpoint. The only change needed is in the vLLM startup command.

```json
{
  "backend": "vllm",
  "vllm_host": "http://localhost:8000",
  "vllm_model": "Qwen/Qwen2.5-72B-Instruct",
  "vram_tier": ">=48gb"
}
```

Note the `vram_tier`. For multi-GPU setups, set this to the combined VRAM tier:
- 2x 24GB → `>=48gb`
- 4x 24GB → you can serve 72B FP16, set to `>=48gb` (there's no dedicated 96GB+ tier)

## Serving Multiple Models on Multiple GPUs

If you have 4 GPUs and want to serve two different 14B models simultaneously (2 GPUs each):

```bash
# Model 1 on GPUs 0 and 1
CUDA_VISIBLE_DEVICES=0,1 python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-14B-Instruct \
  --tensor-parallel-size 2 \
  --port 8000 \
  --served-model-name qwen2.5:14b &

# Model 2 on GPUs 2 and 3
CUDA_VISIBLE_DEVICES=2,3 python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-8B-Instruct \
  --tensor-parallel-size 2 \
  --port 8001 \
  --served-model-name llama3.1:8b &
```

Then configure Infernet to know about both:

```json
{
  "backend": "vllm",
  "vllm_instances": [
    {"host": "http://localhost:8000", "model": "qwen2.5:14b"},
    {"host": "http://localhost:8001", "model": "llama3.1:8b"}
  ],
  "served_models": ["qwen2.5:14b", "llama3.1:8b"]
}
```

## Performance Expectations

Throughput for Qwen2.5-72B on NVIDIA hardware:

| Hardware | Config | Tokens/sec |
|----------|--------|-----------|
| 1x H100 80GB | Single GPU, FP16 | 45–60 |
| 2x A100 40GB | TP=2, FP16 | 70–90 |
| 2x RTX 4090 | TP=2, Q4 | 30–45 |
| 4x RTX 4090 | TP=4, FP16 | 80–100 |
| 4x H100 80GB | TP=4, FP16 | 150–200 |

These are approximate single-request throughputs. Concurrent requests increase total throughput thanks to continuous batching.
