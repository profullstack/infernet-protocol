# Infernet engine (Mojo) — *experimental*

> **Recommended default is Ollama, not this.** See
> [`packages/engine/README.md`](../../packages/engine/README.md) — Ollama
> already solves model download, multi-vendor GPU support, and the
> chat-streaming API. Reach for the Mojo backend only if you have a
> specific reason to want a custom MAX-based runtime.

Mojo+MAX inference engine. Reads NDJSON commands from stdin, streams
NDJSON events to stdout. Drives one model at a time and is meant to be
spawned and kept warm by the Node daemon's `EngineProcess` wrapper in
[`packages/engine`](../../packages/engine).

> **Status: scaffold.** The protocol layer is real and round-trips with
> the JS wrapper, but `handle_generate()` emits canned tokens. Wiring
> MAX (model load + streaming inference) is future work — punted in
> favor of the Ollama backend.

## Layout

```
engine/mojo/
├── pixi.toml          # Modular toolchain (mojo + max) managed by pixi
├── mojoproject.toml   # project metadata for `mojo`
├── src/main.mojo      # entrypoint — speaks v1 NDJSON protocol
└── build/             # output (gitignored): infernet-engine
```

This directory is **not** a JS workspace. It lives at the repo root
(sibling to `supabase/`) and is excluded from `pnpm-workspace.yaml`'s
`packages/*` glob on purpose.

## Install the toolchain

Pick one — pixi is the cleanest project-local option, magic / modular
auth is what the Modular docs walk you through.

### pixi (recommended)

```bash
# 1. Install pixi (one-time, system-wide).
curl -fsSL https://pixi.sh/install.sh | sh

# 2. From this directory:
cd engine/mojo
pixi install        # fetches mojo + max into ./.pixi/
pixi run build      # produces ./build/infernet-engine
```

### magic / modular CLI (alternative)

Follow https://docs.modular.com/mojo/manual/install/ — install `magic`,
then `magic install` in this directory. The pixi.toml is also a valid
magic project (magic is a pixi fork).

## Run it standalone

```bash
pixi run run        # mojo run src/main.mojo
# In the same shell, paste:
{"v":1,"type":"generate","id":"a","messages":[{"role":"user","content":"hi"}]}
{"v":1,"type":"shutdown"}
```

Each outgoing line is one NDJSON event:

```json
{"v":1,"type":"ready","model":null}
{"v":1,"type":"meta","id":"a","model":null,"started_at":"None"}
{"v":1,"type":"token","id":"a","text":"Mojo "}
... etc ...
{"v":1,"type":"done","id":"a","reason":"stop","text":"Mojo engine scaffold — MAX not yet wired."}
```

## Wire it into the daemon

```bash
# Build first
pixi run build

# Then point the daemon at the binary
INFERNET_ENGINE_BIN=$(pwd)/build/infernet-engine \
INFERNET_ENGINE_BACKEND=mojo \
infernet start
```

Without `INFERNET_ENGINE_BIN`, the daemon falls back to the in-process
stub backend (canned tokens) — no Mojo toolchain required for dev.

## Wire protocol

The full message catalog and version semantics live in
[`packages/engine/src/protocol.js`](../../packages/engine/src/protocol.js).
Mirror any change here and bump `PROTOCOL_VERSION` on both sides
together — the wrapper rejects mismatched versions.

## Roadmap

1. ✅ NDJSON protocol + scaffold that round-trips with the JS side.
2. ⬜ Replace canned tokens with a MAX graph for a small llama / mistral
   GGUF / safetensors model. Stream real tokens.
3. ⬜ CUDA / ROCm / Metal device selection via MAX.
4. ⬜ Per-generation cancellation flags (currently a no-op).
5. ⬜ Prebuild tarballs per platform so end users don't need pixi.
