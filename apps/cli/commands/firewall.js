/**
 * `infernet firewall` — print the commands needed to open the P2P port
 * on whichever firewall manager is available on this host.
 *
 * We do NOT mutate firewall state — system-wide firewall rules touch
 * shared state and nearly always require sudo. Printing the exact
 * command to run is the safest posture.
 */

import { DEFAULT_P2P_PORT, resolveP2pPort } from '../lib/network.js';
import { printFirewallHint } from '../lib/firewall.js';

const HELP = `infernet firewall — print firewall commands for the P2P port

Usage:
  infernet firewall [flags]

Flags:
  --port <n>  Override the port (default: config.node.port or ${DEFAULT_P2P_PORT})
  --help      Show this help

Prints the exact commands to open the port on ufw / firewalld / nftables /
iptables (Linux), pf (macOS), or netsh (Windows). You must run the
suggested commands yourself (sudo required on Linux).
`;

export default async function firewall(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const portArg = args.get('port');
    const port = Number.parseInt(portArg ?? '', 10) || resolveP2pPort(ctx?.config ?? null);
    printFirewallHint(port, 'infernet firewall');
    return 0;
}

export { HELP };
