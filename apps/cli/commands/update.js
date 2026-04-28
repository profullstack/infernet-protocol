/**
 * `infernet update` — pull the latest CLI from the official installer,
 * then push current node state to the control plane.
 *
 * What "update" used to mean (--specs-only) was just `register` again,
 * which is misleading: it doesn't ship new code, only fresh metadata.
 * The default now actually runs the install one-liner so a one-command
 * upgrade path exists, then chains into a fresh `register`. Pass
 * --specs-only to keep the old behavior (re-push the existing CLI's
 * specs without touching the binary).
 */

import { spawn } from 'node:child_process';
import register from './register.js';

const HELP = `infernet update — fetch the latest CLI, then push current node state

Usage:
  infernet update [flags]

Flags:
  --specs-only         Skip the binary upgrade; just re-register specs.
  --address <host>     Public address to advertise (passed to register).
  --port <n>           Public port to advertise (passed to register).
  --gpu-model <name>   GPU model override (providers only).
  --price <n>          Price offer (providers only).
  --no-advertise       Don't send address / port.
  --help               Show this help.

What it does (default):
  1. Re-runs the official installer one-liner — pulls the latest CLI
     binary from infernetprotocol.com/install.sh and rebuilds the
     workspace tree. Re-running the installer is idempotent.
  2. Re-runs \`infernet register\` so the upgraded CLI re-uploads its
     freshly-detected specs (CPU, GPUs, interconnects, served models).

  After this command, restart the daemon to load the new code:
    infernet stop && infernet start
  Or just run \`infernet setup\` which now restarts the daemon for you.
`;

const INSTALLER_URL = "https://infernetprotocol.com/install.sh";

function runShell(cmd) {
    return new Promise((resolve) => {
        const child = spawn("sh", ["-c", cmd], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 1));
        child.on("error", () => resolve(1));
    });
}

async function pullLatestBinary() {
    process.stdout.write(`\n→ Pulling latest CLI from ${INSTALLER_URL}\n\n`);
    // The installer is idempotent; re-running updates an existing
    // install in place (per install.sh's own contract).
    const code = await runShell(`curl -fsSL ${INSTALLER_URL} | sh`);
    if (code !== 0) {
        process.stderr.write(`\nerror: installer exited ${code}. Skipping re-register.\n`);
        return false;
    }
    return true;
}

export default async function update(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const specsOnly = args.has('specs-only');

    if (!specsOnly) {
        const ok = await pullLatestBinary();
        if (!ok) return 1;
        process.stdout.write("\n→ Re-registering with the upgraded CLI\n");
    }

    // `register` is an upsert; safe to call from either path.
    const code = await register(args, ctx);
    if (code !== 0) return code;

    if (!specsOnly) {
        process.stdout.write(
            "\n✓ Update complete.\n" +
            "  Restart the daemon to load the new code:\n" +
            "    infernet stop && infernet start\n" +
            "  (or: infernet setup — restarts the daemon for you and re-verifies heartbeat)\n"
        );
    }
    return 0;
}

export { HELP };
