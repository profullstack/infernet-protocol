/**
 * `infernet remove`
 *
 * Deregisters this node via a signed POST to /api/v1/node/remove and
 * optionally wipes the local CLI config. Flags:
 *   --yes              Skip confirmation.
 *   --keep-config      Delete the remote row but leave ~/.config/infernet alone.
 *   --keep-remote      Wipe the local config but leave the remote row alone.
 */

import fs from 'node:fs/promises';

import { getConfigDir, getConfigPath, getDaemonPidPath } from '../lib/config.js';
import { question } from '../lib/prompt.js';

const HELP = `infernet remove — deregister this node and clean up local config

Usage:
  infernet remove [flags]

Flags:
  --yes            Skip confirmation prompt
  --keep-config    Leave ~/.config/infernet/config.json in place
  --keep-remote    Leave the remote row intact (wipe local only)
  --help           Show this help
`;

async function unlinkIfExists(path) {
    try { await fs.unlink(path); return true; }
    catch (err) { if (err.code === 'ENOENT') return false; throw err; }
}

async function rmdirIfExists(path) {
    try { await fs.rm(path, { recursive: true, force: true }); return true; }
    catch (err) { if (err.code === 'ENOENT') return false; throw err; }
}

export default async function remove(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, client } = ctx;
    const node = config.node ?? {};
    const keepConfig = args.has('keep-config');
    const keepRemote = args.has('keep-remote');
    const assumeYes = args.has('yes') || args.has('y');

    if (!node.nodeId && !keepRemote) {
        process.stderr.write(
            'Config is missing node.nodeId — nothing to deregister. Use --keep-remote to only wipe local config.\n'
        );
        return 1;
    }

    const summary = [];
    if (!keepRemote && node.nodeId) {
        summary.push(`  - deregister ${node.role} "${node.nodeId}" from ${config.controlPlane?.url}`);
    }
    if (!keepConfig) {
        summary.push(`  - delete local config at ${getConfigPath()}`);
    }

    process.stdout.write('This will:\n');
    for (const line of summary) process.stdout.write(`${line}\n`);

    if (!assumeYes) {
        if (!process.stdin.isTTY) {
            process.stderr.write('\nRefusing to proceed without --yes in non-interactive mode.\n');
            return 1;
        }
        const answer = (await question('\nContinue? [y/N] ', { default: 'n' })) ?? 'n';
        if (!/^y(es)?$/i.test(answer.trim())) {
            process.stdout.write('Aborted.\n');
            return 0;
        }
    }

    if (!keepRemote && node.nodeId) {
        try {
            await client.remove();
            process.stdout.write(`Deregistered ${node.role} "${node.nodeId}"\n`);
        } catch (err) {
            process.stderr.write(`Remote deregister failed: ${err?.message ?? err}\n`);
            return 1;
        }
    }

    if (!keepConfig) {
        await unlinkIfExists(getDaemonPidPath());
        await rmdirIfExists(getConfigDir());
        process.stdout.write('Local config removed.\n');
    }

    return 0;
}

export { HELP };
