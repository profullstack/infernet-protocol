/**
 * `infernet service` — userland systemd integration for the daemon.
 *
 * An optional alternative to running `infernet start` directly /
 * `infernet start` (detached). When installed, systemd manages the
 * daemon: auto-restart on crash, optional auto-start at boot, logs
 * to journald. Runs as the unprivileged user — never touches /etc
 * or anything system-wide. Service file lives under
 * ~/.config/systemd/user/infernet.service.
 *
 * Linux-only (uses systemd --user). macOS / Windows users continue
 * to run `infernet start` directly or wire their own supervisor.
 *
 * Usage:
 *   infernet service install        write the unit file + daemon-reload
 *   infernet service uninstall      stop / disable / delete the unit file
 *   infernet service enable         systemctl --user enable --now infernet
 *   infernet service disable        systemctl --user disable --now infernet
 *   infernet service status         systemctl --user status infernet
 *   infernet service logs           journalctl --user -u infernet -f
 *   infernet service unit           print the unit file we'd write (no side effects)
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { question } from "../lib/prompt.js";

export const SERVICE_NAME = "infernet";

const HELP = `infernet service — manage the userland systemd unit

Usage:
  infernet service <subcommand> [flags]

Subcommands:
  install         Write ~/.config/systemd/user/${SERVICE_NAME}.service and daemon-reload
  uninstall       Stop, disable, and remove the unit file
  enable          systemctl --user enable --now ${SERVICE_NAME}
  disable         systemctl --user disable --now ${SERVICE_NAME}
  status          systemctl --user status ${SERVICE_NAME}
  logs            journalctl --user -u ${SERVICE_NAME} -f
  unit            Print the unit file that would be written (no side effects)

Flags:
  --confirm       Skip the install / uninstall confirmation prompt.
  --enable-after  After install, also enable + start. Default: no.
  -h, --help      Show this help.

Notes:
  - Linux-only (uses systemd --user). Skip on macOS / Windows.
  - Type=simple. ExecStart calls 'infernet start --foreground' so
    systemd owns the process (no double-fork).
  - Logs go to journald; tail with 'journalctl --user -u ${SERVICE_NAME} -f'
    or 'infernet service logs'.
  - For boot persistence on a system without a logged-in user
    session, run 'loginctl enable-linger $USER' once.
`;

export function getServicePath() {
    return path.join(os.homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
}

/**
 * Render the unit file contents from inputs. Pure function — easy to
 * unit-test, no side effects, no environment lookups.
 *
 * @param {{ nodeBin: string, cliEntry: string, environment?: Record<string,string>, description?: string }} args
 */
export function buildServiceUnit({ nodeBin, cliEntry, environment = {}, description } = {}) {
    if (!nodeBin) throw new Error("buildServiceUnit: nodeBin is required");
    if (!cliEntry) throw new Error("buildServiceUnit: cliEntry is required");

    const desc = description ?? "Infernet Protocol provider daemon";
    const envLines = Object.entries(environment)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `Environment=${k}=${v}`);

    return [
        "[Unit]",
        `Description=${desc}`,
        "Documentation=https://infernetprotocol.com",
        "After=network-online.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        `ExecStart=${nodeBin} ${cliEntry} start --foreground`,
        "Restart=on-failure",
        "RestartSec=10",
        "Environment=NODE_ENV=production",
        ...envLines,
        "",
        "[Install]",
        "WantedBy=default.target",
        ""
    ].join("\n");
}

function resolveCliEntry() {
    // service.js lives at apps/cli/commands/service.js. The CLI entry
    // is one directory up at apps/cli/index.js.
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, "..", "index.js");
}

function ensureLinux() {
    if (process.platform !== "linux") {
        process.stderr.write(
            `error: 'infernet service' is Linux-only (your platform: ${process.platform}).\n` +
            `       use 'infernet start' directly, or wire your own supervisor (launchd, sc, etc.)\n`
        );
        return false;
    }
    return true;
}

function runSystemctl(args, { inherit = true } = {}) {
    const opts = inherit ? { stdio: "inherit" } : { stdio: "pipe" };
    return spawnSync("systemctl", ["--user", ...args], opts);
}

async function installCmd(args) {
    if (!ensureLinux()) return 2;
    const yes = args.has("confirm") || args.has("yes");
    const enableAfter = args.has("enable-after");

    const unit = buildServiceUnit({
        nodeBin: process.execPath,
        cliEntry: resolveCliEntry()
    });
    const target = getServicePath();

    process.stdout.write("\nWill write:\n");
    process.stdout.write("─".repeat(60) + "\n");
    process.stdout.write(unit);
    process.stdout.write("─".repeat(60) + "\n\n");
    process.stdout.write(`To: ${target}\n\n`);

    if (!yes) {
        const ans = await question("Install?", { default: "y" });
        if (!ans.toLowerCase().startsWith("y")) {
            process.stdout.write("aborted\n");
            return 1;
        }
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, unit, { mode: 0o644 });
    process.stdout.write(`✓ wrote ${target}\n`);

    const reload = runSystemctl(["daemon-reload"]);
    if (reload.status !== 0) {
        process.stderr.write("warning: 'systemctl --user daemon-reload' failed — your changes may not be picked up until the next reload.\n");
    } else {
        process.stdout.write("✓ systemctl --user daemon-reload\n");
    }

    if (enableAfter) {
        const enabled = runSystemctl(["enable", "--now", SERVICE_NAME]);
        if (enabled.status === 0) {
            process.stdout.write("✓ enabled and started\n");
        } else {
            process.stderr.write("warning: enable --now failed; run manually with 'systemctl --user enable --now infernet'\n");
        }
    } else {
        process.stdout.write("\nNext:\n");
        process.stdout.write("  systemctl --user enable --now infernet     # auto-start at login + run now\n");
        process.stdout.write("  systemctl --user status infernet            # check status\n");
        process.stdout.write("  journalctl --user -u infernet -f            # tail logs\n");
        process.stdout.write("  loginctl enable-linger $USER                # (one-time) keep running when not logged in\n");
    }
    return 0;
}

async function uninstallCmd(args) {
    if (!ensureLinux()) return 2;
    const yes = args.has("confirm") || args.has("yes");
    const target = getServicePath();

    let exists = true;
    try { await fs.access(target); } catch { exists = false; }

    if (!exists) {
        process.stdout.write(`No service file at ${target}; nothing to do.\n`);
        return 0;
    }

    process.stdout.write(`Will stop / disable / delete: ${target}\n`);
    if (!yes) {
        const ans = await question("Uninstall?", { default: "y" });
        if (!ans.toLowerCase().startsWith("y")) {
            process.stdout.write("aborted\n");
            return 1;
        }
    }

    runSystemctl(["disable", "--now", SERVICE_NAME], { inherit: false });
    try {
        await fs.unlink(target);
        process.stdout.write(`✓ removed ${target}\n`);
    } catch (err) {
        process.stderr.write(`failed to remove unit file: ${err?.message ?? err}\n`);
        return 1;
    }
    runSystemctl(["daemon-reload"], { inherit: false });
    process.stdout.write("✓ uninstalled\n");
    return 0;
}

function spawnInherited(bin, argv) {
    return new Promise((resolve) => {
        const child = spawn(bin, argv, { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
        child.on("error", () => resolve(1));
    });
}

export default async function service(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }
    const sub = (args.positional ?? [])[0];
    switch (sub) {
        case "install":   return installCmd(args);
        case "uninstall": return uninstallCmd(args);
        case "enable":
            if (!ensureLinux()) return 2;
            return spawnInherited("systemctl", ["--user", "enable", "--now", SERVICE_NAME]);
        case "disable":
            if (!ensureLinux()) return 2;
            return spawnInherited("systemctl", ["--user", "disable", "--now", SERVICE_NAME]);
        case "status":
            if (!ensureLinux()) return 2;
            return spawnInherited("systemctl", ["--user", "status", SERVICE_NAME]);
        case "logs":
            if (!ensureLinux()) return 2;
            return spawnInherited("journalctl", ["--user", "-u", SERVICE_NAME, "-f"]);
        case "unit":
            process.stdout.write(buildServiceUnit({
                nodeBin: process.execPath,
                cliEntry: resolveCliEntry()
            }));
            return 0;
        default:
            process.stderr.write(sub
                ? `unknown subcommand: ${sub}\n\n`
                : "error: missing subcommand\n\n");
            process.stderr.write(HELP);
            return 2;
    }
}
