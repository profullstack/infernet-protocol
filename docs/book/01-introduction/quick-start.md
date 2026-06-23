# Quick Start

Get a node online in under 5 minutes. This walkthrough installs c0mpute (the p2p substrate), adds the infernet plugin, runs setup, and verifies the node is heartbeating to the control plane.

## Prerequisites

- Linux (Ubuntu 22.04+ recommended) or macOS
- A GPU (or CPU-only for testing)
- `curl` available on PATH
- An account on the Infernet dashboard to get your registration token

If you're on a GPU machine, make sure your GPU drivers are installed before starting. The setup wizard will detect the GPU, but it can't install drivers for you.

## Step 1: Install c0mpute and the Infernet plugin

Infernet runs as a workload plugin on top of [c0mpute](https://c0mpute.com), which provides peer discovery, the gossipsub auction layer, and a shared toolchain (mise + bun). Two commands:

```bash
# 1. Install c0mpute itself
curl -fsSL https://c0mpute.com/install.sh | sh

# 2. Add the infernet plugin (drops the `infernet` CLI on PATH)
c0mpute plugin install infernet
```

The c0mpute installer takes ~30 seconds (downloads the `c0mpute` binary, installs mise + bun + ffmpeg, optionally symlinks the data dir to a bigger volume on hosts with one). The plugin install takes another ~30 seconds and registers your box as an infernet-capable worker on the c0mpute network.

Verify both:

```bash
c0mpute version
infernet --version
# infernet 0.9.2
```

## Step 2: Get Your Registration Token

Open the [Infernet Dashboard](https://infernetprotocol.com), sign in, and navigate to **Nodes → Add Node**. Copy the one-time registration token shown on that page. It looks like:

```
inft_reg_7x9k2mNpQwRsLvTbY4cJ
```

## Step 3: Run Setup

```bash
infernet setup
```

The setup wizard will:

1. Ask for your registration token
2. Detect your GPU (NVIDIA, AMD, Apple Silicon, or CPU)
3. Determine your VRAM tier (`>=48gb`, `>=24gb`, `>=12gb`, `>=8gb`, or `cpu`)
4. Install Ollama if no inference backend is detected
5. Ask which default model to load (defaults to `qwen2.5:7b` for >=8gb, `qwen2.5:1.5b` for cpu)
6. Generate a secp256k1 keypair for this node
7. Register the node with the control plane
8. Write the config to `~/.infernet/config.json`

Example output:

```
Infernet Node Setup
===================
Registration token: inft_reg_7x9k2mNpQwRsLvTbY4cJ

Detecting hardware...
  GPU: NVIDIA RTX 4090 (24 GB VRAM)
  Tier: >=24gb
  RAM: 64 GB

Checking inference backends...
  Ollama: not found
  Installing Ollama...  done

Default model [qwen2.5:14b]: 
Pulling qwen2.5:14b... ████████████████████ 100% (8.1 GB)

Generating node keypair...
  Public key: npub1abc123...
  Config written to ~/.infernet/config.json

Registering node...
  Node ID: node_8f3a2c1d
  Status: registered

Setup complete. Run `infernet start` to bring your node online.
```

## Step 4: Start the Daemon

```bash
infernet start
```

The daemon starts in the foreground by default. You'll see heartbeat logs:

```
[2026-04-30 14:23:01] Node node_8f3a2c1d starting...
[2026-04-30 14:23:01] Inference backend: ollama (localhost:11434)
[2026-04-30 14:23:01] Loaded models: qwen2.5:14b
[2026-04-30 14:23:02] Heartbeat OK (latency: 42ms)
[2026-04-30 14:23:32] Heartbeat OK (latency: 39ms)
```

To run it in the background:

```bash
infernet start --detach
```

Or install it as a system service that starts on boot:

```bash
infernet service install
```

## Step 5: Verify

Check the node is online from the CLI:

```bash
infernet status
```

```
Node:     node_8f3a2c1d
Status:   online
Uptime:   3 minutes
Backend:  ollama
Models:   qwen2.5:14b
Jobs:     0 completed, 0 pending
Earnings: 0.00 USDC
```

You should also see the node appear as **Online** in the dashboard within 30 seconds of starting the daemon.

## Step 6: Send a Test Job

You can send a test inference job directly from the CLI:

```bash
infernet chat "What is the capital of France?"
```

```
Paris.
```

Or with streaming visible:

```bash
infernet chat --stream "Explain how neural networks learn."
```

Tokens will appear as they're generated.

---

## What's Next

- **Node operators**: Read [Chapter 2](../02-node-operators/index.md) for firewall setup, model management, monitoring, and earnings.
- **Developers**: Read [Chapter 4](../04-building-apps/index.md) for the REST API, SSE streaming, and error handling.
- **Want a different backend?** Read [Chapter 3](../03-inference-backends/index.md) to swap Ollama for vLLM, SGLang, or MAX.
