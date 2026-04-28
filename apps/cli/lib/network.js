/**
 * Network defaults + local address helpers for the Infernet CLI.
 *
 * The P2P port is the well-known TCP port where an Infernet node listens
 * for peer connections (not to be confused with the Unix-domain IPC
 * socket, which is local-only). Other nodes in the network reach this
 * node at `ip:P2P_PORT` (v4 or v6).
 */

import os from 'node:os';

export const DEFAULT_P2P_PORT = 46337;

/**
 * Pick a sensible port: config.node.port → env INFERNET_P2P_PORT → default.
 */
export function resolveP2pPort(config) {
    const fromConfig = config?.node?.port;
    if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;

    const fromEnv = Number.parseInt(process.env.INFERNET_P2P_PORT ?? '', 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

    return DEFAULT_P2P_PORT;
}

// Interface name patterns that indicate a virtual / container bridge.
// Skipped during local-address scanning — even a non-loopback IP on
// docker0 is unreachable from the outside world.
const VIRTUAL_IFACE_PATTERNS = [
    /^docker\d*$/i,    // docker0, docker1
    /^br-[0-9a-f]+$/i, // user-defined docker networks
    /^veth/i,          // container veth pair host side
    /^cni\d*$/i,       // k8s CNI bridge
    /^flannel/i,
    /^cali/i,          // Calico
    /^weave/i,
    /^kube-/i,
    /^lo$/i,
    /^tailscale\d*$/i, // tailscale virtual iface — public via tailscale, but
                       // not useful for advertising on the open internet
    /^tun\d*$/i,
    /^tap\d*$/i,
    /^virbr\d*$/i,     // libvirt
    /^vmnet\d*$/i      // VMware
];

function isVirtualInterface(name) {
    return VIRTUAL_IFACE_PATTERNS.some((rx) => rx.test(name));
}

/**
 * IPv4 ranges that are plausibly the Docker default bridge subnet
 * (172.17.0.0 – 172.31.255.255 — Docker's default-bridge pool sits in
 * 172.17/16 and user networks creep up through 172.31). On a
 * containerized box (Vast.ai, RunPod, etc.) the only assigned address
 * is often inside this range, even if the interface name is plain
 * `eth0` — the address itself is the cleanest signal.
 *
 * Note: 172.16/12 is RFC 1918 and legitimately used for some on-prem
 * LANs. We deliberately only flag the Docker-typical 172.17–172.31
 * subset to avoid false positives.
 */
function isDockerSubnet(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
    if (parts[0] !== 172) return false;
    return parts[1] >= 17 && parts[1] <= 31;
}

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
    if (parts[0] === 127) return true;                     // loopback
    return false;
}

/**
 * Hosting platforms NAT containers — the in-container interface holds
 * a docker-bridge IP, while the public IP lives on the host. Each
 * platform exposes the public IP through a different env var.
 *
 *   RunPod   : RUNPOD_PUBLIC_IP
 *   Vast.ai  : PUBLIC_IPADDR (set by the Vast launcher in the container env)
 *
 * install.sh additionally sets INFERNET_PUBLIC_ADDRESS to whichever it
 * resolved — that takes priority because the operator may also have
 * passed it explicitly.
 */
function platformPublicAddress() {
    const env = process.env;
    const explicit = env.INFERNET_PUBLIC_ADDRESS;
    if (explicit && explicit.trim()) return explicit.trim();
    if (env.RUNPOD_PUBLIC_IP && env.RUNPOD_PUBLIC_IP.trim()) return env.RUNPOD_PUBLIC_IP.trim();
    if (env.PUBLIC_IPADDR && env.PUBLIC_IPADDR.trim()) return env.PUBLIC_IPADDR.trim();
    return null;
}

/**
 * Walk os.networkInterfaces() and return the best candidate address
 * found locally, plus a hint about its quality:
 *   - 'public'         routable IPv4 (ignoring the Docker subnet)
 *   - 'private'        RFC1918 LAN (10/8, 192.168/16, 172.16-172.31 ex docker)
 *   - 'docker'         172.17-172.31 — almost certainly a container bridge
 *   - 'ipv6'           non-link-local IPv6 (no v4 found)
 *   - 'none'           nothing usable
 */
function scanInterfaces() {
    const ifaces = os.networkInterfaces();
    let publicV4 = null;
    let privateV4 = null;
    let dockerV4 = null;
    let v6 = null;
    for (const name of Object.keys(ifaces)) {
        if (isVirtualInterface(name)) continue;
        for (const info of ifaces[name] ?? []) {
            if (info.internal) continue;
            if (info.family === 'IPv4') {
                if (isDockerSubnet(info.address)) {
                    dockerV4 ??= info.address;
                } else if (isPrivateIPv4(info.address)) {
                    privateV4 ??= info.address;
                } else {
                    publicV4 ??= info.address;
                }
            } else if (info.family === 'IPv6' && !v6) {
                if (info.address.toLowerCase().startsWith('fe80')) continue;
                v6 = info.address;
            }
        }
    }
    if (publicV4) return { address: publicV4, kind: 'public' };
    if (privateV4) return { address: privateV4, kind: 'private' };
    if (dockerV4) return { address: dockerV4, kind: 'docker' };
    if (v6) return { address: v6, kind: 'ipv6' };
    return { address: null, kind: 'none' };
}

/**
 * Probe a public echo service to learn the egress IPv4 address. Used
 * only as a last resort when local interface scanning produced a
 * Docker-subnet IP — i.e. we're inside a container that doesn't have
 * its public IP on any local interface.
 *
 * Short timeout, never throws — returns null on any failure.
 */
async function probePublicAddress({ timeoutMs = 2500 } = {}) {
    const endpoints = [
        'https://api.ipify.org',
        'https://icanhazip.com',
        'https://ifconfig.me/ip'
    ];
    for (const url of endpoints) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            let res;
            try {
                res = await fetch(url, { signal: ctrl.signal });
            } finally {
                clearTimeout(timer);
            }
            if (!res.ok) continue;
            const txt = (await res.text()).trim();
            // Sanity check — must look like an IPv4 address.
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(txt)) return txt;
        } catch {
            // try next endpoint
        }
    }
    return null;
}

/**
 * Sync local-only address scan. Useful where async isn't an option
 * (signal handlers, log lines). Honors env overrides but never makes
 * a network call.
 */
export function detectLocalAddressSync() {
    const platform = platformPublicAddress();
    if (platform) return platform;
    const { address } = scanInterfaces();
    return address;
}

/**
 * Best public/advertise address for THIS node. Resolution order:
 *
 *   1. INFERNET_PUBLIC_ADDRESS / RUNPOD_PUBLIC_IP / PUBLIC_IPADDR env
 *   2. A non-Docker, non-private local IPv4
 *   3. A private (LAN) local IPv4 — fine for home/office, peers reach
 *      it inside the same network
 *   4. If we'd otherwise advertise a Docker-bridge IP (172.17-172.31),
 *      probe icanhazip / ipify / ifconfig.me for the actual egress IP
 *   5. IPv6 fallback
 *
 * Returns null if nothing usable was found.
 */
export async function detectLocalAddress() {
    const platform = platformPublicAddress();
    if (platform) return platform;

    const scan = scanInterfaces();
    if (scan.kind === 'public' || scan.kind === 'private') return scan.address;

    if (scan.kind === 'docker' || scan.kind === 'none') {
        const probed = await probePublicAddress();
        if (probed) return probed;
        // Fall through to whatever local hint we had — even a
        // docker-bridge IP is more useful than null in dashboards.
        if (scan.address) return scan.address;
    }

    return scan.address; // ipv6 case, or null
}

/**
 * Format an endpoint string, bracketing IPv6 per RFC 3986:
 *   192.0.2.1:46337       -> "192.0.2.1:46337"
 *   2001:db8::1, port 46337 -> "[2001:db8::1]:46337"
 */
export function formatEndpoint(address, port) {
    if (!address) return `:${port}`;
    if (address.includes(':')) return `[${address}]:${port}`;
    return `${address}:${port}`;
}

// Internals exported for tests.
export const __internals = {
    isVirtualInterface,
    isDockerSubnet,
    isPrivateIPv4,
    platformPublicAddress,
    scanInterfaces,
    probePublicAddress
};
