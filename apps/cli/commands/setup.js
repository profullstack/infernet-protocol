/**
 * `infernet setup` — environment bootstrap.
 *
 * Detects what's installed (Node, Ollama, models), offers to install or
 * pull what's missing, and writes engine preferences to the config so
 * the daemon and `infernet chat` use them by default. Interactive by
 * default; pass --yes (or set INFERNET_NONINTERACTIVE=1) for CI.
 *
 * Things that need root (Ollama install, systemd) are NOT executed —
 * we print the exact command. The CLI runs unprivileged on purpose.
 *
 * Usage:
 *   infernet setup                          # interactive
 *   infernet setup --yes --model qwen2.5:7b # non-interactive
 *   infernet setup --skip-pull              # don't pull a model
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, saveConfig, getConfigPath } from "../lib/config.js";
import { question } from "../lib/prompt.js";
import { applyFirewallRule, detectFirewall, describeFirewallHowTo } from "../lib/firewall.js";
import { DEFAULT_P2P_PORT, resolveP2pPort } from "../lib/network.js";

const pExec = promisify(execFile);

const HELP = `infernet setup — bootstrap node environment

Usage:
  infernet setup [flags]

Flags:
  --yes                  Non-interactive. Use defaults / passed flags.
  --model <name>         Pre-select model to pull (e.g. qwen2.5:7b).
  --skip-pull            Skip the model-pull step.
  --backend <kind>       Pin engine backend (ollama | mojo | stub). Default: ollama.
  --host <url>           Override Ollama host. Default: http://localhost:11434.
  --port <n>             P2P port to open in the firewall. Default: ${DEFAULT_P2P_PORT}.
  --no-firewall          Skip the firewall step entirely.
  -h, --help             Show this help.
`;

const MODEL_SUGGESTIONS = [
    { name: "qwen2.5:0.5b", size: "≈400 MB", note: "smoke test, runs on CPU" },
    { name: "qwen2.5:3b",   size: "≈2 GB",   note: "fits 6 GB+ GPU" },
    { name: "qwen2.5:7b",   size: "≈4.4 GB", note: "fits 8 GB+ GPU — recommended" },
    { name: "qwen2.5:14b",  size: "≈9 GB",   note: "fits 16 GB+ GPU" },
    { name: "qwen2.5:32b",  size: "≈20 GB",  note: "fits 24 GB+ GPU" },
    { name: "qwen2.5:72b",  size: "≈40 GB",  note: "fits 48 GB+ GPU" }
];

function ok(msg)   { process.stdout.write(`  ✓ ${msg}\n`); }
function warn(msg) { process.stdout.write(`  ! ${msg}\n`); }
function fail(msg) { process.stdout.write(`  ✗ ${msg}\n`); }
function step(n, total, label) {
    process.stdout.write(`\n[${n}/${total}] ${label}\n`);
}

async function detectNode() {
    const v = process.versions.node;
    const major = Number.parseInt(v.split(".")[0], 10);
    if (major >= 18) {
        ok(`Node.js v${v}`);
        return true;
    }
    fail(`Node.js v${v} — need 18+. Upgrade: https://nodejs.org`);
    return false;
}

async function detectOllama(host) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
            const body = await res.json().catch(() => ({}));
            const count = Array.isArray(body.models) ? body.models.length : 0;
            ok(`Ollama running at ${host} (${count} model${count === 1 ? "" : "s"} pulled)`);
            return { running: true, models: body.models ?? [] };
        }
    } catch {
        // fall through
    }
    // Reachable check failed — try `ollama --version` to distinguish
    // not-installed vs not-running.
    try {
        const { stdout } = await pExec("ollama", ["--version"], { timeout: 2000 });
        warn(`Ollama installed (${stdout.trim()}) but not reachable at ${host}`);
        warn("  Try: ollama serve &     (or: systemctl --user start ollama)");
        return { running: false, models: [] };
    } catch {
        fail("Ollama not installed");
        process.stdout.write(
            "    Install: curl -fsSL https://ollama.com/install.sh | sh\n"
        );
        return { running: false, models: [], notInstalled: true };
    }
}

async function pullModel(name) {
    process.stdout.write(`    pulling ${name} (this may take a while)...\n`);
    try {
        // Stream stdout/stderr so the user sees progress.
        const child = (await import("node:child_process")).spawn(
            "ollama", ["pull", name],
            { stdio: ["ignore", "inherit", "inherit"] }
        );
        await new Promise((resolve, reject) => {
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ollama pull exited code ${code}`));
            });
            child.on("error", reject);
        });
        ok(`pulled ${name}`);
        return true;
    } catch (err) {
        fail(`pull failed: ${err?.message ?? err}`);
        return false;
    }
}

async function chooseModel(installed, opts) {
    if (opts.preselected) return opts.preselected;
    if (opts.yes) return MODEL_SUGGESTIONS[2].name; // qwen2.5:7b

    process.stdout.write("\n  Which model should this node serve?\n");
    MODEL_SUGGESTIONS.forEach((m, i) => {
        const installedFlag = installed.includes(m.name) ? "  [pulled]" : "";
        process.stdout.write(`    ${i + 1}) ${m.name.padEnd(16)} ${m.size.padEnd(10)} ${m.note}${installedFlag}\n`);
    });
    process.stdout.write(`    ${MODEL_SUGGESTIONS.length + 1}) other (enter manually)\n`);
    const def = "3";
    const ans = await question("  Choice", { default: def });
    const n = Number.parseInt(ans, 10);
    if (n >= 1 && n <= MODEL_SUGGESTIONS.length) return MODEL_SUGGESTIONS[n - 1].name;
    if (n === MODEL_SUGGESTIONS.length + 1) {
        const custom = await question("  Model name (e.g. mistral:7b)", {});
        return custom || null;
    }
    return MODEL_SUGGESTIONS[2].name;
}

export default async function setup(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }

    const yes = args.has("yes") || process.env.INFERNET_NONINTERACTIVE === "1";
    const skipPull = args.has("skip-pull");
    const skipFirewall = args.has("no-firewall");
    const backend = String(args.get("backend") ?? "ollama");
    const host = String(args.get("host") ?? process.env.OLLAMA_HOST ?? "http://localhost:11434");
    const preselectedModel = args.get("model") ? String(args.get("model")) : null;

    const existing = (await loadConfig()) ?? {};
    const portArg = args.get("port");
    const port = Number.parseInt(portArg ?? "", 10) || resolveP2pPort(existing);

    process.stdout.write("\nInfernet setup — checking your environment\n");

    let total = backend === "ollama" ? 4 : 3;
    if (!skipFirewall && process.platform === "linux") total += 1;
    let n = 0;

    n += 1;
    step(n, total, "Node.js");
    const nodeOk = await detectNode();
    if (!nodeOk) return 1;

    let ollamaState = { running: false, models: [] };
    let chosenModel = null;

    if (backend === "ollama") {
        n += 1;
        step(n, total, `Ollama (${host})`);
        ollamaState = await detectOllama(host);
        if (ollamaState.notInstalled) {
            process.stdout.write(
                "\n  Install Ollama with the command above, then re-run `infernet setup`.\n"
            );
            return 1;
        }
        if (!ollamaState.running) {
            process.stdout.write(
                "\n  Start Ollama (see suggestion above), then re-run `infernet setup`.\n"
            );
            return 1;
        }

        n += 1;
        step(n, total, "Model");
        const installedNames = (ollamaState.models ?? []).map((m) => m.name ?? m.model);
        if (skipPull) {
            warn("--skip-pull set; not pulling any model");
            chosenModel = preselectedModel ?? installedNames[0] ?? null;
        } else if (installedNames.length > 0 && !preselectedModel && yes) {
            // Non-interactive + already have something — keep what's there.
            chosenModel = installedNames[0];
            ok(`using already-installed ${chosenModel}`);
        } else {
            chosenModel = await chooseModel(installedNames, { yes, preselected: preselectedModel });
            if (chosenModel && !installedNames.includes(chosenModel)) {
                const okPull = await pullModel(chosenModel);
                if (!okPull) return 1;
            } else if (chosenModel) {
                ok(`${chosenModel} already pulled`);
            }
        }
    }

    if (!skipFirewall && process.platform === "linux") {
        n += 1;
        step(n, total, `Firewall (port ${port}/tcp)`);
        const detected = detectFirewall();
        if (detected.length === 0) {
            warn("no firewall manager detected (ufw / firewalld / nftables / iptables)");
            warn("  if you have one, open the port manually");
        } else {
            const tool = detected[0];
            const { lines } = describeFirewallHowTo(port);
            process.stdout.write(`  Detected: ${tool}\n`);
            for (const line of lines.slice(0, 4)) process.stdout.write(`  ${line}\n`);

            let proceed = yes;
            if (!yes) {
                const ans = await question(`  Apply now (will sudo)?`, { default: "y" });
                proceed = ans.toLowerCase().startsWith("y");
            }
            if (proceed) {
                try {
                    const result = await applyFirewallRule(port, { tool });
                    if (result.applied) ok(`firewall rule applied via ${result.tool}`);
                    else warn(result.reason ?? "skipped");
                } catch (err) {
                    fail(`firewall rule failed: ${err?.message ?? err}`);
                    warn("  re-run later or apply the command manually");
                }
            } else {
                process.stdout.write("  skipped — run `infernet firewall` to print the commands\n");
            }
        }
    }

    n += 1;
    step(n, total, "Config");
    const merged = {
        ...existing,
        engine: {
            ...(existing.engine ?? {}),
            backend,
            ...(host ? { ollamaHost: host } : {}),
            ...(chosenModel ? { model: chosenModel } : {})
        }
    };
    await saveConfig(merged);
    ok(`saved to ${getConfigPath()}`);
    process.stdout.write(`    engine.backend:    ${merged.engine.backend}\n`);
    if (merged.engine.ollamaHost) {
        process.stdout.write(`    engine.ollamaHost: ${merged.engine.ollamaHost}\n`);
    }
    if (merged.engine.model) {
        process.stdout.write(`    engine.model:      ${merged.engine.model}\n`);
    }

    process.stdout.write("\nSetup complete. Try it:\n");
    if (chosenModel) {
        process.stdout.write(`  infernet chat "what is 2+2?"\n`);
    } else {
        process.stdout.write(`  infernet chat --backend stub "smoke test"\n`);
    }
    process.stdout.write(`\nNext: infernet init   (configure node identity + control plane)\n`);
    return 0;
}
