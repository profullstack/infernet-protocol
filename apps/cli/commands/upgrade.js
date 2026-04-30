/**
 * `infernet upgrade` — re-run the official curl installer end-to-end,
 * then run `infernet setup --yes` to regenerate keys, re-register specs,
 * and restart the daemon. Fully autonomous — no manual commands needed.
 *
 * `infernet update` is kept as a thinner verb (specs-only re-register)
 * for operators who just want to push capability updates without
 * touching the binary.
 */

import { spawn } from 'node:child_process';
import setup from './setup.js';

const HELP = `infernet upgrade — re-run the curl installer + autonomous post-upgrade setup

Usage:
  infernet upgrade [flags]

Flags:
  --skip-setup   Just re-run the installer; don't run setup afterward.
  --help         Show this help.

What it does (fully autonomous, no manual steps):
  1. Re-runs the official installer — pulls the latest source from
     infernetprotocol.com/install.sh, refreshes node_modules, re-writes
     the wrapper. Idempotent.
  2. Runs \`infernet setup --yes\` which:
       - Generates any missing model keypairs (IPIP-0028)
       - Re-registers specs with the control plane
       - Restarts the daemon so the new code is live
       - Verifies the heartbeat reaches the control plane

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

    if (args.has('skip-setup')) {
        process.stdout.write("\n✓ Binary updated (skipped setup).\n");
        return 0;
    }

    process.stdout.write("\n→ Running post-upgrade setup (keys + register + daemon restart)\n");

    // setup --yes: non-interactive, confirms everything, restarts daemon.
    // Pass --skip-pull so we don't re-download the model on every upgrade.
    const setupArgs = new Map([['yes', true], ['confirm', true], ['skip-pull', true]]);
    // Forward port/address overrides if the operator passed them.
    for (const k of ['port', 'address', 'no-advertise']) {
        if (args.has(k)) setupArgs.set(k, args.get(k) ?? true);
    }

    return setup(setupArgs, ctx);
}

export { HELP, INSTALLER_URL };
