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

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, saveConfig, getConfigPath } from "../lib/config.js";
import { question } from "../lib/prompt.js";
import { applyFirewallRule, detectFirewall, describeFirewallHowTo } from "../lib/firewall.js";
import { DEFAULT_P2P_PORT, resolveP2pPort } from "../lib/network.js";
import {
    detectGpus, formatGpuLine,
    detectCpus, detectHost, formatCpuLine,
    detectInterconnects, formatInterconnectSummary,
    lastDetectionDiagnostics
} from "@infernetprotocol/gpu";
import { isDaemonAlive } from "../lib/ipc.js";
import { createNodeClient } from "../lib/node-client.js";

const pExec = promisify(execFile);

const HELP = `infernet setup — bootstrap node environment

Usage:
  infernet setup [flags]

Flags:
  --confirm, --yes       Auto-confirm every prompt. Use for unattended runs.
  --model <name>         Pre-select model to pull (e.g. qwen2.5:7b).
  --skip-pull            Skip the model-pull step.
  --backend <kind>       Pin engine backend (ollama | mojo | stub). Default: ollama.
  --host <url>           Override Ollama host. Default: http://localhost:11434.
  --port <n>             P2P port to open in the firewall. Default: ${DEFAULT_P2P_PORT}.
  --no-firewall          Skip the firewall step entirely.
  --skip-identity        Don't chain into \`infernet init\` if identity is missing.
  --skip-register        Don't chain into \`infernet register\` if not registered.
  --skip-daemon          Don't offer to start the daemon.
  -h, --help             Show this help.

By default, every step that wants to install or change something on
your system asks for confirmation first. Pass --confirm (or --yes) to
skip the prompts.
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

async function detectOllama(host, { quiet = false } = {}) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
            const body = await res.json().catch(() => ({}));
            const count = Array.isArray(body.models) ? body.models.length : 0;
            if (!quiet) {
                ok(`Ollama running at ${host} (${count} model${count === 1 ? "" : "s"} pulled)`);
            }
            return { running: true, models: body.models ?? [] };
        }
    } catch {
        // fall through
    }
    // Reachable check failed — try `ollama --version` to distinguish
    // not-installed vs not-running.
    try {
        const { stdout } = await pExec("ollama", ["--version"], { timeout: 2000 });
        return { running: false, models: [], version: stdout.trim() };
    } catch {
        return { running: false, models: [], notInstalled: true };
    }
}

/**
 * Prompt the user to run a command, then run it with inherited stdio
 * (so sudo prompts and command output appear inline). Skipped if `yes`
 * is true. Returns true if the command ran and exited 0; false if the
 * user declined or the command failed.
 */
async function confirmRun({ label, command, yes }) {
    process.stdout.write(`  Will run: ${command}\n`);
    if (!yes) {
        const ans = await question(`  ${label}?`, { default: "y" });
        if (!ans.toLowerCase().startsWith("y")) {
            process.stdout.write("  skipped\n");
            return false;
        }
    }
    return new Promise((resolve) => {
        const child = spawn("sh", ["-c", command], { stdio: "inherit" });
        child.on("exit", (code) => {
            if (code === 0) {
                ok("done");
                resolve(true);
            } else {
                fail(`command exited ${code}`);
                resolve(false);
            }
        });
        child.on("error", (err) => {
            fail(`could not run: ${err?.message ?? err}`);
            resolve(false);
        });
    });
}

async function startOllama({ yes }) {
    // Linux: usually has the ollama systemd unit from the installer.
    // macOS: usually opens the Ollama.app. Fall back to `ollama serve &`.
    const isMac = process.platform === "darwin";
    const cmd = isMac
        ? "open -a Ollama || (ollama serve > /tmp/ollama.log 2>&1 &)"
        : "sudo systemctl start ollama || (ollama serve > /tmp/ollama.log 2>&1 &)";
    return confirmRun({
        label: "Start Ollama now",
        command: cmd,
        yes
    });
}

async function installOllama({ yes }) {
    return confirmRun({
        label: "Install Ollama now (will sudo)",
        command: "curl -fsSL https://ollama.com/install.sh | sh",
        yes
    });
}

/**
 * Spawn another `infernet` subcommand as a child process with stdio
 * inherited, so the user sees the same prompts they'd see if they ran
 * it themselves. Resolves with the child's exit code.
 */
function runSubcommand(subcommand, extraArgs = []) {
    const here = dirname(fileURLToPath(import.meta.url));
    const cliEntry = join(here, "..", "index.js");
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliEntry, subcommand, ...extraArgs], {
            stdio: "inherit"
        });
        child.on("exit", (code) => resolve(code ?? 1));
        child.on("error", reject);
    });
}

/**
 * Fetch the control-plane row for this node, or null. Network/auth
 * errors → null so we don't block on a transient outage. Note that
 * /api/v1/node/me wraps the row as `{ row: <actual> }`, so we have to
 * unwrap before deciding whether registration succeeded.
 */
async function fetchSelfRow(config) {
    if (!config?.controlPlane?.url || !config?.node?.publicKey) return null;
    try {
        const client = createNodeClient({
            url: config.controlPlane.url,
            publicKey: config.node.publicKey,
            privateKey: config.node.privateKey,
            role: config.node.role,
            timeoutMs: 5000
        });
        const resp = await client.me();
        return resp?.row ?? null;
    } catch {
        return null;
    }
}

async function isRegistered(config) {
    return (await fetchSelfRow(config)) !== null;
}

/**
 * After `infernet start` we want to know the daemon's heartbeats are
 * actually landing on the control plane — not just that the local IPC
 * socket is alive. Poll /me until last_seen is recent, or give up.
 */
async function waitForFreshHeartbeat(config, { timeoutMs = 45000, freshMs = 60000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastRow = null;
    while (Date.now() < deadline) {
        const row = await fetchSelfRow(config);
        if (row) {
            lastRow = row;
            const lastSeen = row.last_seen ? Date.parse(row.last_seen) : 0;
            const fresh = Number.isFinite(lastSeen) && Date.now() - lastSeen < freshMs;
            if (fresh && row.status === "available") return { ok: true, row };
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    return { ok: false, row: lastRow };
}

async function pullModel(name) {
    process.stdout.write(`\n  → pulling ${name} via the ollama CLI (this may take a while)...\n\n`);
    try {
        const child = spawn("ollama", ["pull", name], {
            stdio: ["ignore", "inherit", "inherit"]
        });
        await new Promise((resolve, reject) => {
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ollama pull exited code ${code}`));
            });
            child.on("error", reject);
        });
        process.stdout.write("\n");
        ok(`ollama pull ${name} completed`);
        return true;
    } catch (err) {
        fail(`pull failed: ${err?.message ?? err}`);
        return false;
    }
}

async function verifyModelPulled(host, name) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return false;
        const body = await res.json();
        const have = (body.models ?? []).some((m) => (m.name ?? m.model) === name);
        return have;
    } catch {
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

    const yes =
        args.has("yes") ||
        args.has("confirm") ||
        process.env.INFERNET_NONINTERACTIVE === "1";
    const skipPull = args.has("skip-pull");
    const skipFirewall = args.has("no-firewall");
    const skipIdentity = args.has("skip-identity");
    const skipRegister = args.has("skip-register");
    const skipDaemon = args.has("skip-daemon") || args.has("no-start");
    const backend = String(args.get("backend") ?? "ollama");
    const host = String(args.get("host") ?? process.env.OLLAMA_HOST ?? "http://localhost:11434");
    const preselectedModel = args.get("model") ? String(args.get("model")) : null;

    const existing = (await loadConfig()) ?? {};
    const portArg = args.get("port");
    const port = Number.parseInt(portArg ?? "", 10) || resolveP2pPort(existing);

    process.stdout.write("\nInfernet setup — checking your environment\n");

    // Step count: hardware (1) + node (1) + ollama+model (0|2) + firewall (0|1)
    //   + config (1) + identity (0|1) + registration (0|1) + daemon (0|1)
    //   + login (0|1).
    // Track the actual maximum so the printed counter never goes [7/6].
    const isProviderRole = (existing?.node?.role ?? "provider") === "provider";
    let total = 2; // hardware + node.js
    if (backend === "ollama") total += 2; // ollama + model
    if (!skipFirewall && process.platform === "linux") total += 1;
    total += 1; // config
    if (!skipIdentity) total += 1;
    if (!skipRegister && isProviderRole) total += 1;
    if (!skipDaemon && isProviderRole) total += 1;
    total += 1; // login (always offered)
    let n = 0;

    // ---- Hardware (always; first so the operator sees what setup sees) ----
    n += 1;
    step(n, total, "Hardware");
    const hostInfo = detectHost();
    process.stdout.write(`  platform:  ${hostInfo.platform}/${hostInfo.arch}\n`);
    process.stdout.write(`  ram:       ${(hostInfo.total_ram_mb / 1024).toFixed(1)} GB total\n`);
    const cpuList = detectCpus();
    if (cpuList.length === 0) {
        warn("no CPUs detected (this is unusual)");
    } else {
        ok(`${cpuList.length} CPU group${cpuList.length === 1 ? "" : "s"} (${hostInfo.cpu_count} logical cores)`);
        for (const c of cpuList) {
            process.stdout.write(`    · ${formatCpuLine(c)}\n`);
        }
    }
    let detectedGpus = [];
    try {
        detectedGpus = await detectGpus();
    } catch (err) {
        warn(`gpu detection error: ${err?.message ?? err}`);
    }
    if (detectedGpus.length === 0) {
        warn("no GPUs detected — this node will register as CPU-only");
        // Surface per-vendor "why" so an operator with hardware that
        // SHOULD be detected (e.g. a desktop with an Nvidia card but
        // no driver installed) gets an actionable hint instead of a
        // mystery "CPU-only" verdict.
        const diag = lastDetectionDiagnostics();
        const lines = Object.entries(diag).map(([k, v]) => `${k}: ${v}`);
        if (lines.length > 0) {
            process.stdout.write("\n  Why detection came up empty:\n");
            for (const line of lines) process.stdout.write(`    · ${line}\n`);
            process.stdout.write(
                "\n  If you have hardware that should be detected:\n" +
                "    NVIDIA   → install drivers + nvidia-smi (https://www.nvidia.com/Download/index.aspx)\n" +
                "    AMD      → install ROCm (https://rocm.docs.amd.com/en/latest/install/install.html)\n" +
                "    Apple    → on macOS only — Linux can't read Apple Silicon GPUs\n" +
                "    Intel    → integrated GPUs aren't queried (Arc/Iris support is roadmap)\n" +
                "  Then re-run `infernet setup`.\n"
            );
        }
    } else {
        ok(`${detectedGpus.length} GPU${detectedGpus.length === 1 ? "" : "s"}`);
        for (const g of detectedGpus) {
            process.stdout.write(`    · ${formatGpuLine(g)}\n`);
        }
        // If we fell through to lspci, every entry has source: 'lspci' —
        // we know the hardware is present but can't query its specs.
        // Tell the operator how to upgrade detection.
        const lspciOnly = detectedGpus.every((g) => g.source === "lspci");
        if (lspciOnly) {
            process.stdout.write(
                "\n  Detected via lspci only (vendor tooling missing).\n" +
                "  VRAM / utilization / temperature won't be reported until you install\n" +
                "  the right CLI for your card (nvidia-smi for NVIDIA, rocm-smi for AMD).\n"
            );
        }
    }

    // Interconnects — NVLink between GPUs, InfiniBand for multi-node training.
    let interconnects = { nvlink: { available: false, links: [] }, infiniband: { available: false, devices: [] }, rdma_capable: false };
    try {
        interconnects = await detectInterconnects();
    } catch (err) {
        warn(`interconnect detection error: ${err?.message ?? err}`);
    }
    process.stdout.write(`  interconnect: ${formatInterconnectSummary(interconnects)}\n`);
    if (interconnects.nvlink.available) {
        const links = interconnects.nvlink.links;
        const preview = links.slice(0, 6).map((l) => `GPU${l.from}↔GPU${l.to} ${l.kind}`).join(", ");
        process.stdout.write(`    · NVLink topology: ${interconnects.nvlink.topology}${links.length > 6 ? ` — ${preview}, …` : ` — ${preview}`}\n`);
    }
    if (interconnects.infiniband.available) {
        const active = interconnects.infiniband.devices.filter((d) => d.state === "active");
        for (const d of active.slice(0, 6)) {
            const rate = d.rate ? ` ${d.rate}` : "";
            const ll = d.link_layer ? ` ${d.link_layer}` : "";
            process.stdout.write(`    · IB ${d.name}/p${d.port}${rate}${ll} (active)\n`);
        }
    }

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
            warn("Ollama not installed");
            const installed = await installOllama({ yes });
            if (!installed) {
                process.stdout.write(
                    "\n  Re-run `infernet setup` after Ollama is installed.\n"
                );
                return 1;
            }
            // Re-probe — the installer usually starts the daemon on Linux,
            // but not always on macOS.
            ollamaState = await detectOllama(host, { quiet: true });
        }

        if (!ollamaState.running) {
            warn(
                ollamaState.version
                    ? `Ollama installed (${ollamaState.version}) but not reachable at ${host}`
                    : `Ollama installed but not reachable at ${host}`
            );
            const started = await startOllama({ yes });
            if (started) {
                // Give the daemon a beat to bind, then re-probe.
                await new Promise((r) => setTimeout(r, 1500));
                ollamaState = await detectOllama(host, { quiet: true });
            }
            if (!ollamaState.running) {
                process.stdout.write(
                    "\n  Could not bring Ollama up. Start it manually, then re-run `infernet setup`.\n"
                );
                return 1;
            }
        }
        ok(`Ollama running at ${host} (${ollamaState.models?.length ?? 0} model${(ollamaState.models?.length ?? 0) === 1 ? "" : "s"} pulled)`);

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
            if (!chosenModel) {
                fail("no model selected — aborting");
                return 1;
            }
            ok(`selected model: ${chosenModel}`);
            if (!installedNames.includes(chosenModel)) {
                const okPull = await pullModel(chosenModel);
                if (!okPull) return 1;
            } else {
                ok(`${chosenModel} already pulled — skipping download`);
            }
            // Always verify, regardless of whether we just pulled or skipped.
            const ready = await verifyModelPulled(host, chosenModel);
            if (!ready) {
                fail(`${chosenModel} not visible to ollama after pull — check \`ollama list\``);
                return 1;
            }
            ok(`verified: ollama can serve ${chosenModel}`);
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

    // ---- Identity (calls `infernet init` if needed) ----
    let configAfterId = await loadConfig();
    if (!skipIdentity) {
        n += 1;
        step(n, total, "Identity & control plane");
        const hasKey = !!(configAfterId?.node?.publicKey && configAfterId?.node?.privateKey);
        const hasUrl = !!configAfterId?.controlPlane?.url;
        if (hasKey && hasUrl) {
            ok(`identity ready: ${configAfterId.node.publicKey.slice(0, 12)}…, role=${configAfterId.node.role ?? "?"}`);
            ok(`control plane: ${configAfterId.controlPlane.url}`);
        } else {
            warn(hasKey || hasUrl ? "partial identity — finishing init" : "no identity yet — running init");
            const code = await runSubcommand("init", yes ? ["--yes"] : []);
            if (code !== 0) {
                fail(`init exited ${code}`);
                return code;
            }
            configAfterId = await loadConfig();
            ok(`identity: ${configAfterId?.node?.publicKey?.slice(0, 12) ?? "?"}…`);
        }
    }

    const role = configAfterId?.node?.role ?? "provider";
    const isProvider = role === "provider";

    // ---- Registration (always re-runs; register is an upsert, and the
    //      payload shape — specs.cpu, specs.interconnects, etc. — evolves,
    //      so re-registering keeps the row current with the running CLI). ----
    if (!skipRegister && isProvider && configAfterId) {
        n += 1;
        step(n, total, "Provider registration");
        const code = await runSubcommand("register", []);
        if (code !== 0) {
            fail(`register exited ${code}`);
            warn("  re-run `infernet register` once the control plane is reachable");
        } else {
            ok("registered (specs synced)");
        }
    }

    // ---- Daemon (always restart so it picks up current CLI code; providers only) ----
    if (!skipDaemon && isProvider && configAfterId) {
        n += 1;
        step(n, total, "Daemon");
        const wasAlive = await isDaemonAlive(500);
        if (wasAlive) {
            process.stdout.write("  daemon was running — restarting so it picks up current CLI code\n");
            try {
                await runSubcommand("stop", []);
            } catch {
                // best-effort
            }
            // Give the OS a moment to release the IPC socket / pidfile.
            await new Promise((r) => setTimeout(r, 800));
        }
        const startCode = await runSubcommand("start", []);
        if (startCode !== 0) {
            fail(`start exited ${startCode}`);
            warn("  check `infernet logs` and `infernet status`");
        } else {
            await new Promise((r) => setTimeout(r, 1500));
            const aliveNow = await isDaemonAlive(800);
            if (aliveNow) ok(wasAlive ? "daemon restarted" : "daemon started");
            else warn("daemon spawned but not yet responding — check `infernet status`");
        }

        // Heartbeat verification — alive locally isn't enough; the control
        // plane needs to see a fresh last_seen before chat will route to us.
        if (await isDaemonAlive(500)) {
            process.stdout.write("  verifying heartbeat reaches control plane (up to 45s)...\n");
            const res = await waitForFreshHeartbeat(configAfterId);
            if (res.ok) {
                ok(`heartbeat ok — last_seen ${res.row.last_seen}, status=${res.row.status}`);
            } else if (res.row) {
                warn(
                    `daemon alive locally but control plane shows stale state ` +
                    `(last_seen=${res.row.last_seen ?? "never"}, status=${res.row.status ?? "?"}). ` +
                    `Check 'infernet logs' for heartbeat errors.`
                );
            } else {
                warn(
                    `control plane has no row for this pubkey. Either registration ` +
                    `didn't complete, or the daemon is using a different identity. ` +
                    `Try 'infernet register' then 'infernet doctor'.`
                );
            }
        }
    }

    // ---- Login (offer to chain into device-code flow; auto-links pubkey on success) ----
    n += 1;
    step(n, total, "Sign-in");
    const alreadySignedIn = !!(configAfterId?.auth?.bearerToken);
    let didLogin = false;
    if (alreadySignedIn) {
        ok(`signed in as ${configAfterId.auth.email ?? configAfterId.auth.userId}`);
    } else {
        process.stdout.write("  Sign in to view your dashboard, manage payouts, and submit paid jobs.\n");
        let proceed = false;
        if (yes) {
            process.stdout.write("  --yes set; skipping. Run `infernet login` when ready.\n");
        } else {
            const ans = await question("  Sign in now (opens browser)?", { default: "y" });
            proceed = ans.toLowerCase().startsWith("y");
        }
        if (proceed) {
            const code = await runSubcommand("login", []);
            if (code !== 0) warn("  login did not complete — re-run `infernet login` later");
            else { ok("signed in"); didLogin = true; }
        } else if (!yes) {
            process.stdout.write("  skipped — run `infernet login` later\n");
        }
    }

    // ---- Pubkey link (only needed when already-signed-in: a fresh login
    //      already auto-links via login.js → autoLinkPubkey). Without this
    //      step, /dashboard couldn't tell which providers belong to a user
    //      who signed in before they ran `infernet init`. ----
    if (alreadySignedIn && !didLogin && isProvider && configAfterId?.node?.publicKey) {
        const code = await runSubcommand("pubkey", ["link"]);
        if (code !== 0) warn("  pubkey link did not complete — re-run `infernet pubkey link` manually");
    }

    process.stdout.write("\n");
    ok("setup complete");
    process.stdout.write("\nTry it:\n");
    if (chosenModel && configAfterId?.controlPlane?.url) {
        process.stdout.write(`  infernet chat "what is 2+2?"            # P2P\n`);
        process.stdout.write(`  infernet chat --local "what is 2+2?"    # local engine\n`);
    } else if (chosenModel) {
        process.stdout.write(`  infernet chat "what is 2+2?"\n`);
    } else {
        process.stdout.write(`  infernet chat --backend stub "smoke test"\n`);
    }
    process.stdout.write(`  infernet doctor                          # full health check\n`);
    return 0;
}
