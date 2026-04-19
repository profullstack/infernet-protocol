/**
 * `infernet update`
 *
 * Updates this node's row in the control plane with current local state —
 * re-detects specs, refreshes `last_seen`, and applies any flag overrides
 * (address, port, price, gpu-model). Requires that the node already be
 * registered; errors otherwise (use `infernet register` for the first run).
 */

import os from 'node:os';

import { resolveP2pPort, detectLocalAddress } from '../lib/network.js';
import { detectGpus } from '../../src/gpu/detect.js';

const HELP = `infernet update — push current node state to the control plane

Usage:
  infernet update [flags]

Flags:
  --address <host>    Public address to advertise
  --port <n>          Public port to advertise
  --gpu-model <name>  GPU model (providers only)
  --price <n>         Price offer (providers only)
  --name <name>       Display name
  --status <s>        Status (available | busy | offline)
  --help              Show this help
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

async function gatherSpecs() {
    const gpus = await detectGpus();
    return {
        cpu_count: os.cpus().length,
        total_memory: os.totalmem(),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        node_version: process.version,
        gpus
    };
}

export default async function update(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, supabase } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role or node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const table = tableFor(node.role);

    // Confirm the node actually exists before updating.
    const { data: existing, error: lookupErr } = await supabase
        .from(table)
        .select('id,node_id,name,status')
        .eq('node_id', node.nodeId)
        .maybeSingle();

    if (lookupErr) {
        process.stderr.write(`Supabase error during lookup: ${lookupErr.message}\n`);
        return 1;
    }
    if (!existing) {
        process.stderr.write(
            `Node "${node.nodeId}" is not registered yet. Run \`infernet register\` first.\n`
        );
        return 1;
    }

    const payload = { last_seen: new Date().toISOString() };

    const name = args.get('name');
    if (name) payload.name = name;

    const status = args.get('status');
    if (status) payload.status = status;

    // Default address/port from config if not supplied. Re-sending them on
    // update keeps stale values from sticking if the operator changes IP.
    const address = args.get('address') ?? node.address ?? detectLocalAddress();
    if (address) payload.address = address;

    const portRaw = args.get('port') ?? args.get('p2p-port');
    const port = portRaw ? Number.parseInt(portRaw, 10) : resolveP2pPort({ node });
    if (Number.isFinite(port) && port > 0) payload.port = port;

    if (node.role === 'provider') {
        const specs = await gatherSpecs();
        payload.specs = specs;
        const gpuModel = args.get('gpu-model') ?? specs.gpus?.[0]?.model;
        if (gpuModel) payload.gpu_model = gpuModel;
        const price = args.get('price');
        if (price !== undefined) {
            const n = Number.parseFloat(price);
            if (Number.isFinite(n)) payload.price = n;
        }
    }

    process.stdout.write(`Updating ${node.role} "${node.nodeId}" in table ${table}...\n`);

    const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq('node_id', node.nodeId)
        .select()
        .single();

    if (error) {
        process.stderr.write(`Supabase error: ${error.message}\n`);
        return 1;
    }

    process.stdout.write(`Updated. id=${data.id} node_id=${data.node_id ?? node.nodeId}\n`);
    return 0;
}

export { HELP };
