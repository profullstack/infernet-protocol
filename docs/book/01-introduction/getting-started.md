# Getting started

Four ways to use Infernet Protocol. Each section is a copy-paste sequence
that finishes in about five minutes. Pick the path that matches what you
want to do today.

| Track | Who it's for | Outcome |
|---|---|---|
| **1. Use the network** | Developers, end users | Working chat completion call against the public endpoint |
| **2. Run a node** | Operators with a GPU | Daemon registered, accepting jobs, earning crypto |
| **3. Train a custom model** | Builders, researchers | Fine-tuned LoRA from a search query → ready-to-publish model |
| **4. Publish a model** | Whoever just trained one | Model live on huggingface.co AND ollama.com |

---

## Track 1 — Use the network for inference

The public endpoint is OpenAI-compatible. If you've ever called OpenAI's
API, the only thing that changes is the `base_url`.

### curl

```bash
curl https://infernetprotocol.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "qwen2.5:7b",
        "messages": [{"role": "user", "content": "What is Bitcoin?"}],
        "stream": false
    }'
```

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://infernetprotocol.com/v1",
    api_key="no-key-needed-for-playground"
)

stream = client.chat.completions.create(
    model="qwen2.5:7b",
    messages=[{"role": "user", "content": "Who built Linux?"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### JavaScript / Node

```js
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://infernetprotocol.com/v1",
    apiKey: process.env.INFERNET_API_KEY ?? "no-key-needed-for-playground"
});

const res = await client.chat.completions.create({
    model: "qwen2.5:7b",
    messages: [{ role: "user", content: "Explain Schnorr signatures in 3 lines." }]
});
console.log(res.choices[0].message.content);
```

The browser-friendly playground is at <https://infernetprotocol.com/chat>.

---

## Track 2 — Run a node and earn

One curl command bootstraps everything: installs the CLI, sets up Ollama,
opens the firewall port, drops a systemd unit, and registers your node
with the control plane.

```bash
curl -fsSL https://infernetprotocol.com/install.sh | sh
```

Then:

```bash
infernet init             # generates a Nostr keypair, picks defaults
infernet setup            # installs Ollama + a starter model + opens the firewall port
infernet register         # signs and announces your node to the network
infernet start            # starts the daemon (or use `infernet service enable`)
```

Your node is now live. Configure where to send earnings:

```bash
infernet payout set --coin BTC --address bc1q...
infernet payout set --coin USDC --address 0x... --network arbitrum
infernet payout list
```

Quality-of-life commands you'll use daily:

```bash
infernet status                          # daemon health + last-seen
infernet model recommend --install-all   # auto-install best models for your VRAM
infernet uncensored                      # one-shot install of Hermes 3 / Dolphin
infernet logs -f                         # tail the daemon log
infernet upgrade                         # pull the latest CLI
```

The full operator guide is [Chapter 2](../02-node-operators/index.md).

---

## Track 3 — Train a custom model

Same shape as [`rockypod/svelte-coder`](https://ollama.com/rockypod/svelte-coder):
pick a topic, crawl the web for content, fine-tune a base model on the
result. Run it on your one GPU or fan out across all the nodes you own.

### 1. Crawl a search query into a dataset

```bash
infernet train data \
    --query "svelte 5 framework documentation" \
    --domains svelte.dev,kit.svelte.dev,github.com \
    --num 30 \
    --out ./data/svelte5.jsonl
```

No search API key needed — the network proxies the crawl and enforces
a per-node daily quota. (Self-host override: `--direct` with
`VALUESERP_API_KEY`.) Output: a ChatML-format JSONL with hundreds of
training examples extracted from the top web results.

### 2. Scaffold a config

```bash
infernet train init --output ./run
```

Edit `run/infernet.train.yml`:

```yaml
name: svelte5-coder
base_model: unsloth/Qwen2.5-Coder-7B-Instruct
method: qlora
runtime: unsloth
workload_class: C1            # C1 local · C2 sweep · C3 federated

input:
  dataset: ./data/svelte5.jsonl
  format: chatml

training:
  epochs: 3
  learning_rate: 2.0e-4
  batch_size: 4
  max_seq_len: 4096

lora:
  rank: 16
  alpha: 32
  target_modules: [q_proj, k_proj, v_proj, o_proj]

resources:
  min_vram_gb: 24
```

### 3a. Train locally (single GPU)

```bash
infernet train run --local --config ./run/infernet.train.yml
```

One-time install of the Python deps the runner shells out to:

```bash
pip install unsloth datasets trl
```

### 3b. Train on the open network (federated LoRA — experimental)

Pay any opted-in operator on the network — not just nodes you own — to
train shards. Your local `infernet` daemon hosts the dataset shards
directly over its existing reachable port; no S3, no HuggingFace, no
IPFS, no third-party storage anywhere.

```bash
infernet train run --open-market \
    --config ./run/infernet.train.yml \
    --budget 5.00 \
    --max-nodes 8
```

What happens:

1. The CLI splits your local JSONL into 8 shards under
   `~/.infernet/training-runs/<run_id>/shards/` and mints a per-run upload token.
2. Posts a job to `/api/v1/training/jobs` with `dataset_base_url` pointing
   at your own daemon (`<your-endpoint>/v1/training/shards/<run_id>/shard-N.jsonl`).
3. Operators with `INFERNET_ACCEPT_TRAINING=1` poll the market every 60s,
   race-claim shards, fetch directly from your daemon, run the same Unsloth
   runner used in 3a, then PUT the resulting LoRA adapter to your daemon
   (auth via the upload token the control plane handed them).
4. Adapters land in `~/.infernet/training-runs/<run_id>/adapters/`.
5. You FedAvg the 8 adapters once all shards report.

If your machine is behind strict NAT (rare for rented GPU boxes, common
for residential), expose port 8080 via:

```bash
cloudflared tunnel --url http://localhost:8080
export INFERNET_DAEMON_ENDPOINT=https://<the-cloudflared-url>
```

The control plane only ever sees URLs — never your dataset bytes.

Output: `./run/checkpoint-final/` — a HuggingFace-shape directory ready
for Track 4.

---

## Track 4 — Publish to HuggingFace and Ollama

One command, two destinations. The fine-tune lands at
`huggingface.co/<org>/<name>` AND `ollama.com/<user>/<name>`.

```bash
infernet publish ./run/checkpoint-final \
    --hf InfernetProtocol/svelte5-coder \
    --ollama infernet/svelte5-coder \
    --quant q4_k_m
```

What runs under the hood:

1. `huggingface-cli upload` pushes safetensors to HF.
2. `convert_hf_to_gguf.py` from your local `llama.cpp` checkout converts to f16 GGUF.
3. `llama-quantize` quantizes to Q4_K_M (or your `--quant`).
4. An auto-generated `Modelfile` with the ChatML template is written.
5. `ollama create` then `ollama push` ships it to ollama.com.

One-time prerequisites:

```bash
# llama.cpp for the GGUF convert
git clone https://github.com/ggml-org/llama.cpp ~/llama.cpp
cd ~/llama.cpp && cmake -B build && cmake --build build -j

# HF token with write scope on your target org
export HUGGINGFACE_TOKEN=hf_...

# Ollama signin (once)
ollama signin
```

After publish, anyone with Ollama can pull your model:

```bash
ollama pull infernet/svelte5-coder
ollama run infernet/svelte5-coder "How do runes work in Svelte 5?"
```

### Variants

- `--skip-hf` — Ollama only
- `--skip-ollama` — HuggingFace only
- `--modelfile-only` — generate the Modelfile + GGUF locally, don't push anywhere

---

## Stuck?

- [Troubleshooting](../02-node-operators/monitoring.md) for common failure modes
- [Discord](https://discord.gg/w5nHdzpQ29) for real-time help
- [GitHub issues](https://github.com/infernetprotocol/infernet-protocol/issues) for bugs
- [`hello@infernetprotocol.com`](mailto:hello@infernetprotocol.com) for everything else
