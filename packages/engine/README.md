# @infernetprotocol/engine

Pluggable inference engine for the Infernet daemon. One async-iterator API
across backends; the consumer (chat executor, future job runners) doesn't
care which is loaded.

## Backends

| Backend  | Where it runs                       | When it's selected                                          |
| -------- | ----------------------------------- | ----------------------------------------------------------- |
| `ollama` | Local Ollama daemon (HTTP)          | **Default** when Ollama is reachable on `OLLAMA_HOST`       |
| `mojo`   | External Mojo+MAX binary            | `INFERNET_ENGINE_BIN` set, or `backend:"mojo"` (experimental) |
| `stub`   | In-process canned tokens            | Fallback when neither is available — daemon still works     |

**Ollama is the recommended default.** It already solves model download
+ cache, multi-vendor GPU (CUDA / ROCm / Metal), per-platform installers,
and a stable streaming chat API. Operators install it once
(<https://ollama.com>), `ollama pull qwen2.5:7b`, and they're serving.

The `mojo` backend is kept for the eventual case where a custom Mojo+MAX
binary is worth squeezing extra perf out of — see
[`engine/mojo/`](../../engine/mojo) for the scaffold.

## Usage

```js
import { createEngine } from "@infernetprotocol/engine";

const engine = await createEngine();   // auto-selects backend
const { id, stream, cancel } = engine.generate({
    messages: [{ role: "user", content: "hi" }],
    model: "qwen2.5:7b"
});

for await (const ev of stream) {
    if (ev.type === "token") process.stdout.write(ev.text);
    if (ev.type === "done")  console.log("\nfinished:", ev.reason);
    if (ev.type === "error") throw new Error(ev.message);
}

await engine.shutdown();
```

## Auto-selection precedence

1. `INFERNET_ENGINE_BACKEND` env var (explicit override: `ollama`, `mojo`, `stub`)
2. `INFERNET_ENGINE_BIN` set → `mojo`
3. Ollama reachable on `OLLAMA_HOST` (default `http://localhost:11434`) → `ollama`
4. → `stub`

## Operator setup (typical)

```bash
# 1. Install Ollama (one line per platform — see ollama.com).
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull whichever model your node will serve.
ollama pull qwen2.5:7b      # 4.4 GB — fits a 6+ GB GPU
ollama pull qwen2.5:0.5b    # 400 MB — useful for CPU smoke tests

# 3. Tell the daemon which model this node serves.
INFERNET_ENGINE_MODEL=qwen2.5:7b infernet start
```

Pick whichever model fits your VRAM. Qwen 2.5 family is a reasonable
default; the engine is model-agnostic.

## Wire protocol — `mojo` backend

The Mojo backend communicates with its binary over NDJSON v1 stdio.
Source of truth: [`src/protocol.js`](./src/protocol.js); mirrored on the
Mojo side in [`engine/mojo/src/main.mojo`](../../engine/mojo/src/main.mojo).
Bumping `PROTOCOL_VERSION` is a breaking change — both sides must move
together.

The Ollama backend talks HTTP to the operator's Ollama daemon, so the v1
protocol is purely an internal-IPC concern there.

## Testing

`pnpm vitest run tests/engine.test.js` — 16 tests covering:
- Protocol codec round-trip + version mismatch handling
- NDJSON splitter across chunk boundaries
- `EngineProcess` against `test/fake-engine.js` (Node script speaking the
  protocol — no Mojo toolchain required)
- Ollama backend against an in-process fake HTTP server (no real Ollama
  required) — streaming, cancellation, HTTP errors, missing model
- `createEngine` auto-selection
