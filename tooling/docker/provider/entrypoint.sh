#!/bin/sh
# Boot script for the Infernet provider image. Idempotently configures
# the CLI from environment variables, registers the node with the
# Supabase control plane, and runs the daemon in foreground so the
# container's supervisor (Docker / Kubernetes / RunPod) can manage it.
set -e

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

ROLE="${INFERNET_NODE_ROLE:-provider}"
NAME="${INFERNET_NODE_NAME:-$(hostname)}"
PORT="${INFERNET_P2P_PORT:-46337}"

# Always run as root inside the container — the CLI writes its config
# under $HOME/.config/infernet; ensure HOME is set.
export HOME="${HOME:-/root}"
mkdir -p "$HOME/.config/infernet"

echo "[infernet-provider] initializing node (role=$ROLE name=$NAME port=$PORT)"
infernet init --force \
  --supabase-url "$SUPABASE_URL" \
  --supabase-key "$SUPABASE_SERVICE_ROLE_KEY" \
  --role "$ROLE" \
  --name "$NAME" \
  --p2p-port "$PORT" \
  --skip-firewall-hint

echo "[infernet-provider] registering node"
infernet register

echo "[infernet-provider] starting daemon (foreground)"
exec infernet start --foreground
