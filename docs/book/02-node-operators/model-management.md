# Model Management

Models are the inventory of your node. The more relevant models you have loaded, the more jobs you'll match. Managing this inventory well is one of the primary levers you have over your node's earnings.

## How Served Models Work

Your node's config has a `served_models` array. This is the canonical list of models your node advertises to the network:

```json
{
  "served_models": ["qwen2.5:14b", "llama3.2:3b", "deepseek-coder:6.7b"]
}
```

When the daemon heartbeats, it reports these models to the control plane. The job router uses this list to determine which jobs your node can accept. A job for `qwen2.5:14b` will only be routed to nodes that list it in `served_models`.

The models must actually be loaded in the inference backend. `served_models` and what's actually pulled in your backend (e.g., `ollama list`) should stay in sync. The daemon checks this at startup and warns if there's a mismatch.

## Installing Models via CLI

```bash
infernet model install qwen2.5:14b
```

This does three things:
1. Pulls the model into the inference backend (`ollama pull qwen2.5:14b` for Ollama backends)
2. Adds the model to `served_models` in your config
3. Sends a sync heartbeat so the control plane updates immediately (no need to wait 30 seconds)

Watch the pull progress:

```bash
infernet model install qwen2.5:14b --verbose
# Pulling qwen2.5:14b from Ollama registry...
# ██████████████████░░ 89% (7.2 GB / 8.1 GB)  45 MB/s
```

For vLLM or SGLang backends, specify the HuggingFace model ID:

```bash
infernet model install Qwen/Qwen2.5-14B-Instruct
```

## Removing Models via CLI

```bash
infernet model remove qwen2.5:14b
```

This:
1. Removes the model from `served_models`
2. Deletes the weights from the backend
3. Syncs with the control plane

The node will stop receiving jobs for this model immediately.

## Listing Installed Models

```bash
infernet model list
```

```
Model                    Size      Backend    Status
qwen2.5:14b              8.1 GB    ollama     loaded
llama3.2:3b              2.0 GB    ollama     loaded
deepseek-coder:6.7b      3.8 GB    ollama     loaded
```

## Installing Models via Dashboard

In the Infernet Dashboard, navigate to your node's detail page and click **Manage Models**. You'll see:

- **Installed models**: currently in your served_models
- **Suggested models**: models with active job demand that your tier can run
- **Browse**: search the full model catalog

Click **Install** on any model. The command is queued in the control plane's command queue and picked up by the daemon on its next heartbeat cycle (within 30 seconds).

The daemon polls the command queue on every heartbeat tick. Commands are structured like:

```json
{
  "type": "model_install",
  "model": "qwen2.5:32b",
  "issued_at": "2026-04-30T14:00:00Z"
}
```

The daemon executes the install, updates `served_models`, and acknowledges the command back to the control plane.

## Model Naming Conventions

Models are identified by the format used by the installed backend:

**Ollama**:
```
qwen2.5:7b
qwen2.5:14b
qwen2.5:72b
llama3.2:3b
llama3.1:8b
deepseek-coder:6.7b
nomic-embed-text:latest
```

**vLLM / SGLang / MAX** (HuggingFace repo IDs):
```
Qwen/Qwen2.5-7B-Instruct
Qwen/Qwen2.5-14B-Instruct
meta-llama/Llama-3.1-8B-Instruct
deepseek-ai/DeepSeek-V2-Lite
```

**llama.cpp** (GGUF filenames):
```
qwen2.5-7b-instruct-q4_k_m.gguf
llama-3.1-8b-instruct-q5_k_m.gguf
```

When installing via the CLI, use the naming format appropriate for your backend. The control plane normalizes model names for routing.

## VRAM Planning

Before installing a model, check that it fits in your VRAM. Rule of thumb: a model needs roughly 2 bytes per parameter for FP16, 1 byte per parameter for INT8, and 0.5 bytes per parameter for Q4.

| Model | FP16 VRAM | INT8 VRAM | Q4 VRAM |
|-------|-----------|-----------|---------|
| 3B | 6 GB | 3 GB | 1.5 GB |
| 7B | 14 GB | 7 GB | 3.5 GB |
| 14B | 28 GB | 14 GB | 7 GB |
| 32B | 64 GB | 32 GB | 16 GB |
| 70B | 140 GB | 70 GB | 35 GB |

With Ollama, quantized variants are pulled by default. Specify the tag explicitly to get a particular quantization:

```bash
# Q4_K_M quantized (smaller, faster)
infernet model install qwen2.5:14b-instruct-q4_K_M

# FP16 (full precision, needs full VRAM)
infernet model install qwen2.5:14b-instruct-fp16
```

## Hot-Swap vs Cold-Load

Ollama keeps loaded models in VRAM until memory pressure requires eviction. If you have multiple models installed, Ollama will swap them in and out as needed. This means:

- First inference on a model after a swap takes 5–30 seconds (load time)
- Subsequent inferences are fast

If you want a model to always be hot (no load latency), limit your `served_models` to the number of models that fit simultaneously in your VRAM, and tell Ollama to keep them loaded:

```bash
# Keep model in VRAM indefinitely (Ollama-specific)
OLLAMA_KEEP_ALIVE=-1 ollama run qwen2.5:14b
```

Or set the env var in your config and restart the daemon.
