/**
 * `infernet` (no args) → interactive console.
 *
 * Modeled on `claude` / `codex` / `hermes` with no args: drop into a
 * REPL where the operator can chat, inspect, and tweak settings via
 * slash commands. Plain text → one-shot chat against the configured
 * model/node. Slash commands operate on the session.
 *
 * Slash commands:
 *   /help                       show this list
 *   /model                      show the active model
 *   /model <name>               switch to a different model
 *   /model <name>@<pubkey>      pin a specific provider node
 *   /models                     same as /models list
 *   /models list                list models served on the network
 *   /status                     dump daemon + control plane status
 *   /clear                      clear the screen
 *   /quit | /exit | Ctrl-D      leave the console
 *
 * If no config exists yet, the console invites the operator to run
 * `infernet setup` and exits cleanly — never silently fails.
 */

import readline from "node:readline";
import { loadConfig } from "../lib/config.js";
import { submitChatJob, streamChatEvents } from "../lib/remote-chat.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ACCENT = "\x1b[36m";

export default async function consoleCmd(_args, ctx) {
    const config = ctx?.config ?? (await loadConfig());

    if (!config) {
        process.stdout.write("\nNo Infernet config found.\n\n");
        process.stdout.write("Run setup to install the daemon + register your node:\n");
        process.stdout.write(`    ${BOLD}infernet setup${RESET}\n\n`);
        process.stdout.write("Or for a one-shot inference without a daemon:\n");
        process.stdout.write(`    ${BOLD}infernet chat --local "your prompt"${RESET}\n\n`);
        return 1;
    }

    const session = {
        model: config?.engine?.model ?? null,
        node: null, // optional pinned-provider pubkey
        controlPlaneUrl: config?.controlPlane?.url ?? "https://infernetprotocol.com"
    };

    showWelcome(session);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: prompt(session),
        terminal: true,
        historySize: 200
    });

    rl.prompt();

    return new Promise((resolve) => {
        rl.on("line", async (line) => {
            const input = line.trim();
            if (!input) { rl.prompt(); return; }

            try {
                if (input === "/quit" || input === "/exit") {
                    rl.close();
                    return;
                }
                if (input === "/help" || input === "/?") {
                    showHelp();
                } else if (input === "/clear") {
                    process.stdout.write("\x1b[2J\x1b[H");
                } else if (input === "/status") {
                    await printStatus(session);
                } else if (input === "/model") {
                    process.stdout.write(`Active model: ${session.model ?? "(none — set with /model <name>)"}\n`);
                    if (session.node) process.stdout.write(`Pinned node:  ${session.node}\n`);
                } else if (input.startsWith("/model ")) {
                    setModel(session, input.slice("/model ".length).trim());
                    rl.setPrompt(prompt(session));
                } else if (input === "/models" || input === "/models list") {
                    await listModels(session);
                } else if (input.startsWith("/")) {
                    process.stderr.write(`Unknown slash command: ${input}. Try /help\n`);
                } else {
                    // Plain text → one-shot chat.
                    await runChatOnce(session, input);
                }
            } catch (err) {
                process.stderr.write(`error: ${err?.message ?? err}\n`);
            }

            rl.prompt();
        });

        rl.on("close", () => {
            process.stdout.write("\nbye.\n");
            resolve(0);
        });

        // Ctrl-C → cancel current line, don't exit
        rl.on("SIGINT", () => {
            process.stdout.write("\n(use /quit or Ctrl-D to leave)\n");
            rl.prompt();
        });
    });
}

function prompt(session) {
    const tag = session.model ? `${session.model}` : "no-model";
    const pin = session.node ? `@${shortPubkey(session.node)}` : "";
    return `${ACCENT}infernet${RESET} ${DIM}(${tag}${pin})${RESET} > `;
}

function shortPubkey(pk) {
    if (!pk) return "";
    if (pk.length <= 12) return pk;
    return pk.slice(0, 6) + "…" + pk.slice(-4);
}

function showWelcome(session) {
    process.stdout.write(`\n${BOLD}Infernet console${RESET}  ${DIM}(/help for commands, /quit to leave)${RESET}\n`);
    process.stdout.write(`  control plane: ${session.controlPlaneUrl}\n`);
    process.stdout.write(`  model:         ${session.model ?? "(none — /model <name> to set)"}\n\n`);
}

function showHelp() {
    process.stdout.write(`
${BOLD}Slash commands${RESET}
  /help                          show this list
  /model                         show the active model
  /model <name>                  switch to a different model (e.g. qwen2.5:7b)
  /model <name>@<pubkey>         pin a specific provider node
  /models                        list models served on the network
  /models list                   same as above
  /status                        daemon + control plane status
  /clear                         clear the screen
  /quit, /exit, Ctrl-D           leave the console

${BOLD}Anything else${RESET} → sent as a chat message to the active model.
`);
}

function setModel(session, arg) {
    const at = arg.lastIndexOf("@");
    if (at !== -1) {
        session.model = arg.slice(0, at).trim();
        session.node = arg.slice(at + 1).trim() || null;
    } else {
        session.model = arg;
        session.node = null;
    }
    process.stdout.write(`✓ active model: ${session.model}${session.node ? `@${shortPubkey(session.node)}` : ""}\n`);
}

async function listModels(session) {
    try {
        const res = await fetch(`${session.controlPlaneUrl}/api/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const models = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        if (models.length === 0) {
            process.stdout.write("No models advertised on the network right now.\n");
            return;
        }
        process.stdout.write(`\n${BOLD}Models served on the network${RESET}\n`);
        for (const m of models) {
            const name = m.name ?? m.model ?? "(unknown)";
            const provs = m.providers ?? m.provider_count ?? "?";
            const seen = m.freshest_seen ?? m.last_seen ?? "";
            process.stdout.write(`  ${name.padEnd(32)} ${String(provs).padEnd(4)} providers   ${DIM}${seen}${RESET}\n`);
        }
        process.stdout.write("\n");
    } catch (err) {
        process.stderr.write(`/models failed: ${err?.message ?? err}\n`);
    }
}

async function printStatus(session) {
    try {
        const res = await fetch(`${session.controlPlaneUrl}/api/overview`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        process.stdout.write(`\nControl plane: ${session.controlPlaneUrl}\n`);
        const cards = body?.cards ?? body?.data?.cards ?? [];
        for (const c of cards) {
            process.stdout.write(`  ${String(c.label ?? c.title ?? "?").padEnd(20)} ${c.value ?? c.count ?? ""}\n`);
        }
        process.stdout.write("\n");
    } catch (err) {
        process.stderr.write(`/status failed: ${err?.message ?? err}\n`);
    }
}

async function runChatOnce(session, prompt) {
    if (!session.model) {
        process.stderr.write("No model selected. Use /model <name> first (e.g. /model qwen2.5:7b).\n");
        return;
    }
    const messages = [{ role: "user", content: prompt }];
    const job = await submitChatJob({
        url: session.controlPlaneUrl,
        messages,
        model: session.model,
        provider_pubkey: session.node ?? undefined
    });
    if (!job?.jobId) {
        process.stderr.write(`submit failed${job?.error ? `: ${job.error}` : ""}\n`);
        return;
    }
    let any = false;
    for await (const ev of streamChatEvents({ url: session.controlPlaneUrl, jobId: job.jobId })) {
        if (ev.type === "token") {
            process.stdout.write(ev.data?.text ?? "");
            any = true;
        } else if (ev.type === "done") {
            if (any) process.stdout.write("\n");
            return;
        } else if (ev.type === "error") {
            process.stderr.write(`\nerror: ${ev.data?.message ?? "unknown"}\n`);
            return;
        }
    }
    if (any) process.stdout.write("\n");
}
