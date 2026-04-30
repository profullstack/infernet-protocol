# Ollama

Ollama is the default backend. It handles NVIDIA, AMD (ROCm), Apple Silicon (Metal), and CPU inference with no additional configuration. If you're not sure which backend to use, start with Ollama.

## Installing Ollama

`infernet setup` installs Ollama automatically if no backend is detected. To install it manually:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs the `ollama` binary and configures it as a systemd service.

Verify the install:

```bash
ollama --version
# ollama version 0.5.4

ollama list
# NAME    ID    SIZE  MODIFIED
```

## Pulling Models

Ollama manages its own model registry. Pull models before starting the Infernet daemon:

```bash
ollama pull qwen2.5:14b
ollama pull qwen2.5:7b
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

Ollama auto-selects quantization based on your available VRAM. To pull a specific quantization:

```bash
# Q4_K_M — good balance of quality and size
ollama pull qwen2.5:14b-instruct-q4_K_M

# Q8 — higher quality, needs more VRAM
ollama pull qwen2.5:14b-instruct-q8_0

# Full precision FP16
ollama pull qwen2.5:14b-instruct-fp16
```

List your pulled models:

```bash
ollama list
```

```
NAME                              ID              SIZE      MODIFIED
qwen2.5:14b                       d8c5e0b67b1e    8.1 GB   2 hours ago
llama3.2:3b                       a80c4f17acd5    2.0 GB   1 day ago
nomic-embed-text:latest           0a109f422b47    274 MB   3 days ago
```

## Hardware Support

### NVIDIA (CUDA)

Ollama uses CUDA for NVIDIA GPUs. CUDA is bundled with Ollama — you don't need to install it separately (though having it installed doesn't hurt). You do need the NVIDIA driver.

```bash
# Verify NVIDIA GPU is detected
nvidia-smi
ollama run qwen2.5:7b "hello" 2>&1 | head -5
```

Ollama will use all available NVIDIA GPUs. To restrict to specific GPUs:

```bash
CUDA_VISIBLE_DEVICES=0 ollama serve
```

### AMD (ROCm)

ROCm support is included in the official Ollama Linux build. Works with RX 6000 series and newer:

```bash
# Verify ROCm is detected
rocm-smi
ollama run qwen2.5:7b "hello"
```

If Ollama doesn't detect your AMD GPU, check:

```bash
# Should list your GPU
/opt/rocm/bin/rocminfo | grep "Agent 2" -A 10
```

Older GCN architecture cards may need `HSA_OVERRIDE_GFX_VERSION`:

```bash
HSA_OVERRIDE_GFX_VERSION=10.3.0 ollama serve
```

### Apple Silicon (Metal)

Ollama uses Metal on Apple Silicon. No configuration needed:

```bash
ollama run qwen2.5:7b "hello"
# Uses GPU automatically
```

Ollama treats the unified memory as both system RAM and VRAM, so a MacBook Pro with 36GB unified memory can run larger models than an NVIDIA GPU with 24GB VRAM.

### CPU Fallback

If no GPU is detected, Ollama falls back to CPU inference using highly optimized GGML kernels. It's slow but works:

```bash
OLLAMA_NUM_GPU=0 ollama serve  # Force CPU mode
```

## Key Environment Variables

```bash
# Ollama server address (default: http://127.0.0.1:11434)
OLLAMA_HOST=0.0.0.0:11434

# Keep models in VRAM between requests (0 = unload after use, -1 = never unload)
OLLAMA_KEEP_ALIVE=5m

# Number of parallel requests per model (default: auto based on VRAM)
OLLAMA_NUM_PARALLEL=4

# Max number of models loaded simultaneously
OLLAMA_MAX_LOADED_MODELS=3

# Context window size override
OLLAMA_NUM_CTX=8192

# Force CPU-only mode
OLLAMA_NUM_GPU=0

# Custom models directory
OLLAMA_MODELS=/mnt/fast-nvme/ollama/models
```

Set these in `/etc/systemd/system/ollama.service.d/override.conf` for persistent configuration:

```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MODELS=/mnt/fast-nvme/ollama/models"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

## Infernet-Specific Config

In your Infernet config (`~/.infernet/config.json`):

```json
{
  "backend": "ollama",
  "ollama_host": "http://localhost:11434"
}
```

If Ollama is running on a different machine or port:

```json
{
  "backend": "ollama",
  "ollama_host": "http://192.168.1.50:11434"
}
```

## Troubleshooting

**Ollama not starting:**
```bash
sudo systemctl status ollama
journalctl -u ollama -n 50
```

**GPU not detected:**
```bash
# NVIDIA
nvidia-smi  # Should show GPU
ls /dev/nvidia*  # Should show devices

# AMD  
rocm-smi --showid
ls /dev/kfd  # Should exist for ROCm
```

**Slow inference (possible CPU fallback):**
```bash
# Run with verbose to see what device is used
OLLAMA_DEBUG=1 ollama run qwen2.5:7b "hello" 2>&1 | grep -i gpu
```

**Out of memory:**
```bash
# Check current VRAM usage
nvidia-smi --query-gpu=memory.used,memory.free --format=csv

# Unload all models
ollama stop --all
```
