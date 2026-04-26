/**
 * `infernet help` — top-level usage.
 */

const USAGE = `infernet — GPU node control plane for the Infernet Protocol

Usage:
  infernet <command> [args]

Setup:
  setup        Bootstrap environment (Ollama + model + firewall + config)
  model        Manage models (list / pull / remove / use)

Node lifecycle:
  init         Configure this node (control-plane URL, role, Nostr identity)
  login        Update the control-plane URL
  register     Register this node with the control plane (signed)
  update       Push current capability/status to the control plane (signed)
  remove       Deregister this node and wipe local config (signed)

Daemon:
  start        Start the node daemon (detached by default)
  stop         Stop the running daemon
  status       Show this node's current state (remote row + live daemon)
  stats        Live in-memory stats from the running daemon (via IPC)
  logs         Show / tail the daemon log (~/.config/infernet/daemon.log)

Diagnostics:
  gpu          Inspect local GPUs (nvidia-smi / rocm-smi / system_profiler)
  firewall     Print commands to open the P2P port on your firewall
  chat         Run a single inference locally (no control plane needed)

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
