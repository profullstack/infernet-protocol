/**
 * `infernet register`
 *
 * Announces this node to the control plane via a Nostr-signed POST to
 * /api/v1/node/register. The server verifies ownership of the pubkey and
 * upserts a row in providers / aggregators / clients keyed on node_id.
 *
 * Only coarse capability data is sent — vendor + VRAM tier per GPU. No
 * hostname, platform, CPU model, or RAM total leaves the node.
 */

import { saveConfig } from '../lib/config.js';
import { resolveP2pPort, detectLocalAddress } from '../lib/network.js';
import { detectGpus, detectInterconnects } from '@infernetprotocol/gpu';

const HELP = `infernet register — announce this node to the control plane

Usage:
  infernet register [flags]

Flags:
  --address <host>    Public address to advertise
  --port <n>          Public port to advertise
  --gpu-model <name>  GPU model (providers only)
  --price <n>         Price offer (providers only)
  --no-advertise      Don't send address / port
  --help              Show this help
`;

function vramTier(vramMb) {
    if (!Number.isFinite(vramMb) || vramMb <= 0) return 'unknown';
    if (vramMb < 8 * 1024) return '<8gb';
    if (vramMb < 16 * 1024) return '8-16gb';
    if (vramMb < 24 * 1024) return '16-24gb';
    if (vramMb < 48 * 1024) return '24-48gb';
    return '>=48gb';
}

/**
 * Reduce interconnect detection to a coarse, leak-free shape:
 *   - device names / board_ids stripped
 *   - just the capability flags clients need for matchmaking
 */
function summarizeInterconnects(ic) {
    const nvlink = ic?.nvlink ?? { available: false, topology: 'none', links: [] };
    const xgmi = ic?.xgmi ?? { available: false, topology: 'none', links: [] };
    const ib = ic?.infiniband ?? { available: false, devices: [] };
    const efa = ic?.efa ?? { available: false, devices: [] };
    const activePorts = ib.devices.filter((d) => d.state === 'active');
    return {
        nvlink: {
            available: !!nvlink.available,
            topology: nvlink.topology ?? 'none',
            link_count: Array.isArray(nvlink.links) ? nvlink.links.length : 0
        },
        xgmi: {
            available: !!xgmi.available,
            topology: xgmi.topology ?? 'none',
            link_count: Array.isArray(xgmi.links) ? xgmi.links.length : 0
        },
        infiniband: {
            available: !!ib.available,
            active_port_count: activePorts.length
        },
        efa: {
            available: !!efa.available,
            adapter_count: Array.isArray(efa.devices) ? efa.devices.length : 0
        },
        rdma_capable: !!ic?.rdma_capable
    };
}

async function gatherCoarseSpecs() {
    const [gpus, interconnects] = await Promise.all([detectGpus(), detectInterconnects()]);
    return {
        gpu_count: gpus.length,
        gpus: gpus.map((g) => ({
            vendor: (g.vendor ?? 'unknown').toLowerCase(),
            vram_tier: vramTier(g.vram_mb),
            model: typeof g.model === 'string' ? g.model.slice(0, 64) : null
        })),
        interconnects: summarizeInterconnects(interconnects)
    };
}

export default async function register(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, client, configPath } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role or node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const noAdvertise = args.has('no-advertise');
    const addressFlag = args.get('address');
    const portFlag = args.get('port') ?? args.get('p2p-port');
    const address = noAdvertise ? undefined : (addressFlag ?? node.address ?? detectLocalAddress());
    const portRaw = portFlag ?? node.port;
    const port = noAdvertise ? undefined
        : (portRaw ? Number.parseInt(portRaw, 10) : resolveP2pPort({ node }));

    const payload = {
        node_id: node.nodeId,
        name: node.name ?? node.nodeId
    };
    if (address) payload.address = address;
    if (Number.isFinite(port) && port > 0) payload.port = port;

    if (node.role === 'provider') {
        const specs = await gatherCoarseSpecs();
        payload.specs = specs;
        const gpuModel = args.get('gpu-model') ?? specs.gpus?.[0]?.model;
        if (gpuModel) payload.gpu_model = gpuModel;
        const price = args.get('price');
        if (price !== undefined) {
            const n = Number.parseFloat(price);
            if (Number.isFinite(n)) payload.price = n;
        }
    }

    process.stdout.write(`Registering ${node.role} "${node.nodeId}"...\n`);

    let row;
    try {
        row = await client.register(payload);
    } catch (err) {
        process.stderr.write(`Register failed: ${err?.message ?? err}\n`);
        return 1;
    }

    // The register response can be terse on older deployments
    // (sometimes just { node_id }, no id). Fetch the canonical row
    // via the signed `me` endpoint so we always have the server's
    // truth, regardless of the deployed register handler's shape.
    let canonical = row;
    let canonicalId = row?.id ?? null;
    try {
        const me = await client.me();
        if (me && typeof me === "object") {
            canonical = me;
            canonicalId = me.id ?? canonicalId;
        }
    } catch {
        // Non-fatal: we'll fall back to whatever register returned.
    }

    const nextConfig = {
        ...config,
        node: {
            ...node,
            id: canonicalId ?? node.id ?? null,
            address: noAdvertise ? null : (address ?? node.address ?? null),
            port: noAdvertise ? null : (Number.isFinite(port) ? port : node.port ?? null)
        }
    };
    await saveConfig(nextConfig);

    const displayId = canonicalId ?? "(server did not return one)";
    const displayNodeId = canonical?.node_id ?? row?.node_id ?? node.nodeId;
    process.stdout.write(`Registered. id=${displayId} node_id=${displayNodeId}\n`);
    if (canonicalId) {
        process.stdout.write(`Config updated with assigned uuid at ${configPath}\n`);
    } else {
        process.stdout.write(`Note: control plane returned no id — likely an older deployment.\n`);
        process.stdout.write(`      registration succeeded; id will populate after first heartbeat.\n`);
    }
    return 0;
}

export { HELP };
