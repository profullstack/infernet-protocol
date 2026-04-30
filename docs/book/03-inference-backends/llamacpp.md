# llama.cpp

llama.cpp is a C++ implementation of LLM inference with no Python dependency. It runs on CPU, NVIDIA (CUDA), AMD (ROCm), Apple Silicon (Metal), and even mobile hardware. It uses GGUF, a quantized model format that makes large models accessible on consumer hardware.

Use llama.cpp when you want CPU or Apple Silicon inference, need GGUF models, or want to avoid a Python installation entirely.

## llama-swap

For production use with Infernet, we recommend **llama-swap** on top of llama.cpp. llama-swap is a Go proxy that manages multiple llama.cpp instances, handles model routing by name, and hot-swaps models on demand. It exposes an OpenAI-compatible API that Infernet can talk to directly.

```
Client → llama-swap (port 8080) → llama.cpp instance (per model)
```

## Installing llama.cpp

### Pre-built Binaries

```bash
# Download latest release
LLAMA_VERSION=$(curl -s https://api.github.com/repos/ggerganov/llama.cpp/releases/latest | jq -r .tag_name)
curl -sSL "https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-ubuntu-x64.zip" -o llama.zip
unzip llama.zip -d llama-cpp
sudo cp llama-cpp/llama-server /usr/local/bin/
```

### Building from Source (with CUDA)

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j$(nproc)
sudo cp build/bin/llama-server /usr/local/bin/
```

### Building for Apple Silicon (Metal)

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
cmake -B build -DGGML_METAL=ON
cmake --build build --config Release -j$(sysctl -n hw.logicalcpu)
```

## Installing llama-swap

```bash
# Download pre-built binary
curl -sSL https://github.com/mostlygeek/llama-swap/releases/latest/download/llama-swap-linux-amd64 \
  -o /usr/local/bin/llama-swap
chmod +x /usr/local/bin/llama-swap
```

## Getting GGUF Models

GGUF models are hosted on HuggingFace under repos maintained by Bartowski, TheBloke, and others:

```bash
# Using HuggingFace CLI
pip install huggingface_hub
huggingface-cli download bartowski/Qwen2.5-14B-Instruct-GGUF \
  Qwen2.5-14B-Instruct-Q4_K_M.gguf \
  --local-dir ~/.cache/llama-cpp/models/

# Or direct download
wget https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf \
  -O ~/.cache/llama-cpp/models/qwen2.5-14b-q4km.gguf
```

GGUF quantization levels:

| Quantization | Size (7B) | Quality | Use case |
|--------------|-----------|---------|----------|
| Q2_K | 2.7 GB | Low | Minimum VRAM/RAM |
| Q4_K_M | 4.1 GB | Good | Default choice |
| Q5_K_M | 4.8 GB | Very good | Quality-focused |
| Q6_K | 5.5 GB | Near-lossless | Max quality / CPU |
| Q8_0 | 7.2 GB | Near-lossless | VRAM to spare |
| F16 | 14 GB | Lossless | Reference |

## Starting llama.cpp Directly

```bash
llama-server \
  --model ~/.cache/llama-cpp/models/qwen2.5-14b-q4km.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  --n-gpu-layers 99 \
  --ctx-size 8192 \
  --n-parallel 4
```

`--n-gpu-layers 99` offloads all layers to GPU. Set to 0 for CPU-only. Set to a specific number to split between CPU and GPU (useful when the model doesn't fully fit in VRAM).

## Configuring llama-swap

llama-swap uses a YAML config to define which models to serve:

```yaml
# ~/.config/llama-swap/config.yaml
models:
  qwen2.5:14b:
    cmd: llama-server
    args:
      - --model
      - /root/.cache/llama-cpp/models/qwen2.5-14b-q4km.gguf
      - --n-gpu-layers
      - "99"
      - --ctx-size
      - "8192"
      - --n-parallel
      - "4"
    port: 8081
    
  qwen2.5:7b:
    cmd: llama-server
    args:
      - --model
      - /root/.cache/llama-cpp/models/qwen2.5-7b-q4km.gguf
      - --n-gpu-layers
      - "99"
      - --ctx-size
      - "8192"
      - --n-parallel
      - "8"
    port: 8082

proxy:
  port: 8080
  healthcheck_timeout: 30s
  swap_timeout: 60s
```

Start llama-swap:

```bash
llama-swap --config ~/.config/llama-swap/config.yaml
```

llama-swap now handles routing requests for `qwen2.5:14b` and `qwen2.5:7b` to the appropriate llama-server instance, loading/unloading models as needed.

## Apple Silicon Performance

On Apple Silicon, llama.cpp with Metal is often the best choice — even faster than many NVIDIA GPU setups for smaller models, thanks to the unified memory architecture:

```bash
# macOS build with Metal automatically uses GPU
llama-server \
  --model qwen2.5-14b-q4km.gguf \
  --n-gpu-layers 99 \
  --ctx-size 16384 \
  --port 8080
```

M2 Pro (16GB) can comfortably run Q4 14B models at 30–50 tokens/second. M3 Max (128GB) can run Q4 70B models at 20+ tokens/second.

## CPU-Only Mode

For CPU inference, use Q4_K_M or smaller:

```bash
llama-server \
  --model qwen2.5-7b-q4km.gguf \
  --n-gpu-layers 0 \
  --threads $(nproc) \
  --ctx-size 4096 \
  --port 8080
```

CPU inference is slow (5–15 tokens/second for a 7B model on a modern CPU), but it works and requires no GPU.

## Key Environment Variables

```bash
# llama.cpp server address
LLAMACPP_HOST=http://localhost:8080

# For llama-swap, same variable
LLAMACPP_HOST=http://localhost:8080

# CUDA device selection
CUDA_VISIBLE_DEVICES=0
```

## Infernet Config

```json
{
  "backend": "llamacpp",
  "llamacpp_host": "http://localhost:8080"
}
```

## Systemd Service (llama-swap)

```ini
[Unit]
Description=llama-swap Model Server
After=network.target

[Service]
Type=simple
User=infernet
ExecStart=/usr/local/bin/llama-swap --config /home/infernet/.config/llama-swap/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
