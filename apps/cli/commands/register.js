/**
 * `infernet register`
 *
 * Reads the CLI config, connects to Supabase, inserts/upserts this node into
 * the appropriate table based on `config.node.role`:
 *
 *   provider   -> providers
 *   aggregator -> aggregators
 *   client     -> clients
 *
 * Keyed on `node_id` (text, unique). Captures local specs via `os` and stores
 * them in `specs` (providers/aggregators) / payload fields.
 */

import os from 'node:os';

import { saveConfig } from '../lib/config.js';
import { resolveP2pPort, detectLocalAddress } from '../lib/network.js';
import { detectGpus } from '@infernetprotocol/gpu';

const HELP = `infernet register — announce this node to the control plane

Usage:
  infernet register [flags]

Flags:
  --address <host>    Public address to advertise
  --port <n>          Public port to advertise
  --gpu-model <name>  GPU model (providers only)
  --price <n>         Price offer (providers only)
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

export default async function register(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, supabase, configPath } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role or node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const table = tableFor(node.role);
    const specs = await gatherSpecs();

    // Resolve address + port: flag > config > autodetect.
    const addressFlag = args.get('address');
    const portFlag = args.get('port') ?? args.get('p2p-port');
    const address = addressFlag ?? node.address ?? detectLocalAddress();
    const port = portFlag ? Number.parseInt(portFlag, 10) : resolveP2pPort({ node });

    const basePayload = {
        node_id: node.nodeId,
        name: node.name ?? node.nodeId,
        public_key: node.publicKey ?? null,
        last_seen: new Date().toISOString(),
        status: 'available'
    };

    if (address) basePayload.address = address;
    if (Number.isFinite(port) && port > 0) basePayload.port = port;

    if (node.role === 'provider') {
        basePayload.specs = specs;
        const gpuModel = args.get('gpu-model') ?? specs.gpus?.[0]?.model;
        if (gpuModel) basePayload.gpu_model = gpuModel;
        const price = args.get('price');
        if (price !== undefined) {
            const n = Number.parseFloat(price);
            if (Number.isFinite(n)) basePayload.price = n;
        }
    } else if (node.role === 'client') {
        delete basePayload.status; // clients.status default is 'active'
    }

    process.stdout.write(`Registering ${node.role} "${node.nodeId}" in table ${table}...\n`);

    const { data, error } = await supabase
        .from(table)
        .upsert(basePayload, { onConflict: 'node_id' })
        .select()
        .single();

    if (error) {
        process.stderr.write(`Supabase error: ${error.message}\n`);
        return 1;
    }

    // Persist the assigned uuid back to the config for future commands.
    const nextConfig = {
        ...config,
        node: { ...node, id: data.id }
    };
    await saveConfig(nextConfig);

    process.stdout.write(`Registered. id=${data.id} node_id=${data.node_id ?? node.nodeId}\n`);
    process.stdout.write(`Config updated with assigned uuid at ${configPath}\n`);
    return 0;
}

export { HELP };
