/**
 * `infernet login`
 *
 * Re-prompts for Supabase URL + service-role key (and optionally schema)
 * and overwrites those fields in the existing config. Leaves node identity
 * fields alone.
 */

import { getConfigPath, loadConfig, saveConfig } from '../lib/config.js';
import { question } from '../lib/prompt.js';

const HELP = `infernet login — update Supabase credentials

Usage:
  infernet login [flags]

Flags:
  --supabase-url <url>    Supabase project URL
  --supabase-key <key>    Supabase service-role key
  --schema <name>         Supabase schema (default: keep existing, else public)
  --help                  Show this help
`;

export default async function login(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const existing = (await loadConfig()) ?? {};
    const currentSupabase = existing.supabase ?? {};

    let url = args.get('supabase-url');
    let key = args.get('supabase-key');
    let schema = args.get('schema');

    if (!url) {
        url = await question('Supabase URL', { default: currentSupabase.url });
    }
    if (!key) {
        key = await question('Supabase service-role key', { secret: true });
        if (!key && currentSupabase.serviceRoleKey) {
            key = currentSupabase.serviceRoleKey;
        }
    }
    if (!schema) {
        schema = currentSupabase.schema ?? 'public';
    }

    if (!url) {
        process.stderr.write('Supabase URL is required.\n');
        return 1;
    }
    if (!key) {
        process.stderr.write('Supabase service-role key is required.\n');
        return 1;
    }

    const next = {
        ...existing,
        supabase: { url, serviceRoleKey: key, schema }
    };
    // Ensure a node section exists so downstream commands don't explode.
    if (!next.node) {
        next.node = {
            id: null,
            nodeId: null,
            role: null,
            name: null,
            publicKey: null,
            privateKey: null
        };
    }

    const written = await saveConfig(next);
    process.stdout.write(`Updated ${written}\n`);
    process.stdout.write(`Supabase URL: ${url}\n`);
    process.stdout.write(`Schema:       ${schema}\n`);
    if (!existing.node || !existing.node.nodeId) {
        process.stdout.write(`Next:         run \`infernet init\` to configure node identity, or \`infernet register\`.\n`);
    }
    return 0;
}

export { HELP };
