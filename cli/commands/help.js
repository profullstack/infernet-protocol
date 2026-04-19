/**
 * `infernet help` — top-level usage.
 */

const USAGE = `infernet — GPU node control plane for the Infernet Protocol

Usage:
  infernet <command> [args]

Node lifecycle:
  init         Configure this node (Supabase URL, role, identity, P2P port)
  login        Update Supabase credentials
  register     Register this node in the control plane
  update       Push current specs/status to the control plane
  remove       Deregister this node and wipe local config

Daemon:
  start        Start the node daemon (detached by default)
  stop         Stop the running daemon
  status       Show this node's current state (Supabase + live daemon)
  stats        Live in-memory stats from the running daemon (via IPC)
  logs         Show / tail the daemon log (~/.config/infernet/daemon.log)

Diagnostics:
  gpu          Inspect local GPUs (nvidia-smi / rocm-smi / system_profiler)
  firewall     Print commands to open the P2P port on your firewall

Payments:
  payout       Manage payout coin/address
  payments     Show recent payment transactions

Other:
  help         Show this help

Run \`infernet <command> --help\` for per-command help.
`;

export default async function help() {
    process.stdout.write(USAGE);
}

export { USAGE };
