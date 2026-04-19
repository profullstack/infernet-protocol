/**
 * `infernet remove`
 *
 * Deregisters this node from the control plane and (optionally) wipes the
 * local CLI config. Requires explicit confirmation via `--yes` unless stdin
 * is a TTY (in which case it prompts).
 *
 * Flags:
 *   --yes              Skip the confirmation prompt.
 *   --keep-config      Delete the Supabase row but leave ~/.config/infernet alone.
 *   --keep-remote      Wipe the local config but leave the Supabase row alone.
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
  --keep-remote    Leave the Supabase row intact (wipe local only)
  --help           Show this help
`;

function tableFor(role) {
    switch (role) {
        case 'provider':
            return 'providers';
        case 'aggregator':
            return 'aggregators';
        case 'client':
            return 'clients';
        default:
            throw new Error(`Unknown role "${role}"`);
    }
}

async function unlinkIfExists(path) {
    try {
        await fs.unlink(path);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
    }
}

async function rmdirIfExists(path) {
    try {
        await fs.rm(path, { recursive: true, force: true });
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
    }
}

export default async function remove(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, supabase } = ctx;
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
        summary.push(`  - delete ${node.role} row where node_id="${node.nodeId}" from Supabase`);
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

    // Deregister from Supabase first.
    if (!keepRemote && node.nodeId) {
        const table = tableFor(node.role);
        const { error } = await supabase.from(table).delete().eq('node_id', node.nodeId);
        if (error) {
            process.stderr.write(`Supabase error: ${error.message}\n`);
            return 1;
        }
        process.stdout.write(`Deregistered ${node.role} "${node.nodeId}"\n`);
    }

    // Then wipe local state.
    if (!keepConfig) {
        await unlinkIfExists(getDaemonPidPath());
        await rmdirIfExists(getConfigDir());
        process.stdout.write('Local config removed.\n');
    }

    return 0;
}

export { HELP };
