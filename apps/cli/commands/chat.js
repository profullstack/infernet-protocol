/**
 * `infernet chat` — local inference, no control plane.
 *
 * Talks straight to the engine package (Ollama by default; stub if no
 * runtime is reachable; mojo if the operator points us at a binary).
 * Useful for verifying that a node's chosen model actually responds
 * before bringing the daemon + control plane into the loop.
 *
 * Usage:
 *   infernet chat "what is 2+2"
 *   infernet chat --model qwen2.5:7b "tell me a story"
 *   echo "summarize this" | infernet chat
 *   infernet chat --backend stub "anything"
 *
 * Flags:
 *   --model <name>         Model id passed to the backend (e.g. qwen2.5:7b).
 *                          Falls back to $INFERNET_ENGINE_MODEL.
 *   --backend <kind>       Force a backend: ollama | mojo | stub.
 *                          Default: auto-select (Ollama if reachable).
 *   --host <url>           Override Ollama host (default $OLLAMA_HOST or
 *                          http://localhost:11434).
 *   --system <text>        Prepend a system message.
 *   --temperature <num>    Sampling temperature.
 *   --max-tokens <num>     Cap on generated tokens.
 *   --json                 Emit one NDJSON event per line instead of
 *                          streaming raw token text. Useful for piping.
 *
 * Exits 0 on `done`, non-zero on `error`.
 */

import { createEngine, MSG } from "@infernetprotocol/engine";

const HELP = `infernet chat — run a single inference locally, no control plane

Usage:
  infernet chat [flags] [prompt]
  echo "..." | infernet chat [flags]

Flags:
  --model <name>         Model id (e.g. qwen2.5:7b). $INFERNET_ENGINE_MODEL fallback.
  --backend <kind>       ollama | mojo | stub. Default: auto.
  --host <url>           Override Ollama host. Default: \$OLLAMA_HOST or localhost:11434.
  --system <text>        Prepend a system message.
  --temperature <num>    Sampling temperature.
  --max-tokens <num>     Cap on generated tokens.
  --json                 Emit NDJSON events instead of raw token stream.
  -h, --help             Show this help.
`;

async function readStdin() {
    if (process.stdin.isTTY) return "";
    let buf = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) buf += chunk;
    return buf;
}

export default async function chat(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }

    // The shared parseArgs() in index.js greedily consumes the next
    // non-dash token as a flag's value. For known-boolean flags we
    // recover the swallowed token back into the prompt.
    const reclaimed = [];
    for (const name of ["json"]) {
        const v = args.get(name);
        if (typeof v === "string") reclaimed.push(v);
    }
    const positional = [...reclaimed, ...(args.positional ?? [])];
    let prompt = positional.join(" ").trim();
    if (!prompt) {
        prompt = (await readStdin()).trim();
    }
    if (!prompt) {
        process.stderr.write("error: no prompt — pass as argument or pipe via stdin\n\n");
        process.stderr.write(HELP);
        return 2;
    }

    const messages = [];
    const sys = args.get("system");
    if (sys) messages.push({ role: "system", content: String(sys) });
    messages.push({ role: "user", content: prompt });

    const backendOpt = args.get("backend");
    const model = args.get("model") ?? process.env.INFERNET_ENGINE_MODEL ?? null;
    const host = args.get("host");
    const temperatureRaw = args.get("temperature");
    const maxTokensRaw = args.get("max-tokens");
    const jsonMode = args.has("json");

    const engineOpts = {};
    if (backendOpt) engineOpts.backend = String(backendOpt);
    if (host) engineOpts.host = String(host);
    if (model) engineOpts.defaultModel = model;

    let engine;
    try {
        engine = await createEngine(engineOpts);
    } catch (err) {
        process.stderr.write(`engine init failed: ${err?.message ?? err}\n`);
        return 1;
    }

    const generation = engine.generate({
        messages,
        model,
        temperature: temperatureRaw != null ? Number(temperatureRaw) : undefined,
        max_tokens: maxTokensRaw != null ? Number(maxTokensRaw) : undefined
    });

    let onSigint = null;
    const cancelOnSignal = () => {
        process.stderr.write("\n[cancelled]\n");
        generation.cancel();
    };
    process.on("SIGINT", cancelOnSignal);
    onSigint = cancelOnSignal;

    let exitCode = 0;
    try {
        for await (const ev of generation.stream) {
            if (jsonMode) {
                process.stdout.write(JSON.stringify(ev) + "\n");
                continue;
            }
            switch (ev.type) {
                case MSG.TOKEN:
                    process.stdout.write(ev.text ?? "");
                    break;
                case MSG.DONE:
                    if (process.stdout.isTTY) process.stdout.write("\n");
                    break;
                case MSG.ERROR:
                    process.stderr.write(`\nerror: ${ev.message ?? "engine error"}\n`);
                    exitCode = 1;
                    break;
                default:
                    // meta / log / unknown — ignore in plain-text mode
                    break;
            }
        }
    } finally {
        if (onSigint) process.off("SIGINT", onSigint);
        try {
            await engine.shutdown();
        } catch {
            // best-effort
        }
    }

    return exitCode;
}
