/**
 * `infernet upgrade` — re-run the official curl installer end-to-end,
 * then push current node state back to the control plane.
 *
 * This is the headline "get me on the latest CLI" verb. It's a thin
 * wrapper around the same one-liner the docs and landing page tell
 * operators to use:
 *
 *   curl -fsSL https://infernetprotocol.com/install.sh | sh
 *
 * The installer is idempotent — re-running it pulls the latest source,
 * re-installs node_modules, and re-writes the wrapper. After that we
 * call `register` so the upgraded CLI re-uploads its freshly-detected
 * specs (CPU, GPUs, interconnects, served models).
 *
 * `infernet update` is kept as a thinner verb (specs-only re-register)
 * for operators who just want to push capability updates without
 * touching the binary.
 */

import { spawn } from 'node:child_process';

import { loadConfig } from '../lib/config.js';
import { createNodeClientFromConfig } from '../lib/node-client.js';
import register from './register.js';

const HELP = `infernet upgrade — re-run the curl installer, then re-register specs

Usage:
  infernet upgrade [flags]

Flags:
  --address <host>     Public address to advertise (passed to register).
  --port <n>           Public port to advertise (passed to register).
  --gpu-model <name>   GPU model override (providers only).
  --price <n>          Price offer (providers only).
  --no-advertise       Don't send address / port.
  --skip-register      Just re-run the installer; don't re-register specs.
  --help               Show this help.

What it does:
  1. Re-runs the official installer one-liner — pulls the latest source
     from infernetprotocol.com/install.sh, refreshes node_modules, and
     re-writes the wrapper. The installer is idempotent.
  2. Re-runs \`infernet register\` so the upgraded CLI re-uploads its
     freshly-detected specs (CPU, GPUs, interconnects, served models).

  After this command, restart the daemon to load the new code:
    infernet stop && infernet start
  Or just run \`infernet setup\` which also restarts the daemon for you.

To uninstall the CLI entirely, run \`infernet remove\`.
`;

const INSTALLER_URL = "https://infernetprotocol.com/install.sh";

function runShell(cmd) {
    return new Promise((resolve) => {
        const child = spawn("sh", ["-c", cmd], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 1));
        child.on("error", () => resolve(1));
    });
}

export async function pullLatestBinary() {
    process.stdout.write(`\n→ Pulling latest CLI from ${INSTALLER_URL}\n\n`);
    const code = await runShell(`curl -fsSL ${INSTALLER_URL} | sh`);
    if (code !== 0) {
        process.stderr.write(`\nerror: installer exited ${code}.\n`);
        return false;
    }
    return true;
}

export default async function upgrade(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const ok = await pullLatestBinary();
    if (!ok) return 1;

    if (args.has('skip-register')) {
        process.stdout.write("\n✓ Upgrade complete (skipped re-register).\n");
        return 0;
    }

    // The router puts `upgrade` in NO_CONFIG so the installer can run
    // even on a half-broken box. Load config opportunistically here so
    // we can also re-register specs when there IS one.
    let config = ctx?.config ?? null;
    let client = ctx?.client ?? null;
    if (!config) config = await loadConfig().catch(() => null);
    if (!config) {
        process.stdout.write(
            "\n✓ Upgrade complete.\n" +
            "  No local config — run `infernet init` to wire up identity, then\n" +
            "  `infernet register` to advertise this node.\n"
        );
        return 0;
    }
    if (!client) {
        try { client = createNodeClientFromConfig(config); }
        catch (err) {
            process.stderr.write(`note: skipping re-register (${err.message})\n`);
            return 0;
        }
    }

    process.stdout.write("\n→ Re-registering with the upgraded CLI\n");
    const code = await register(args, { ...ctx, config, client });
    if (code !== 0) return code;

    process.stdout.write(
        "\n✓ Upgrade complete.\n" +
        "  Restart the daemon to load the new code:\n" +
        "    infernet stop && infernet start\n" +
        "  (or: infernet setup — restarts the daemon for you and re-verifies heartbeat)\n"
    );
    return 0;
}

export { HELP, INSTALLER_URL };
