#!/usr/bin/env bash
#
# Container entrypoint for chovy/infernetprotocol provider images.
#
# Boots Ollama, initializes the infernet identity, optionally claims
# the node under a user account via INFERNET_BEARER, runs
# `infernet setup`, and tail-execs `infernet start --foreground`.
#
# All configuration via env vars (see Dockerfile.provider header).

set -euo pipefail

log() { printf '\n[infernet-provider] %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Defaults (Dockerfile.provider sets ENV; these handle exec'd shells)
# ---------------------------------------------------------------------------
INFERNET_CONTROL_PLANE="${INFERNET_CONTROL_PLANE:-https://infernetprotocol.com}"
INFERNET_MODEL="${INFERNET_MODEL:-qwen2.5:7b}"
INFERNET_NODE_ROLE="${INFERNET_NODE_ROLE:-provider}"
INFERNET_NODE_NAME="${INFERNET_NODE_NAME:-$(hostname)}"
INFERNET_PUBLIC_PORT="${INFERNET_PUBLIC_PORT:-46337}"
INFERNET_BEARER="${INFERNET_BEARER:-}"
PORT="${PORT:-8080}"

if [ -z "${INFERNET_PUBLIC_ADDRESS:-}" ]; then
    INFERNET_PUBLIC_ADDRESS="$(curl -fsS --max-time 3 https://icanhazip.com 2>/dev/null \
        || curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null \
        || hostname -I 2>/dev/null | awk '{print $1}' \
        || echo '')"
fi

log "control plane: $INFERNET_CONTROL_PLANE"
log "model:         $INFERNET_MODEL"
log "public addr:   ${INFERNET_PUBLIC_ADDRESS:-(auto-detect failed)}"
log "public port:   $INFERNET_PUBLIC_PORT"
log "/healthz port: $PORT"

# ---------------------------------------------------------------------------
# Ollama — start in background and wait for readiness
# ---------------------------------------------------------------------------
log "Starting Ollama..."
nohup ollama serve >/tmp/ollama.log 2>&1 &
for _ in $(seq 1 30); do
    if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
done

log "Pulling model $INFERNET_MODEL..."
ollama pull "$INFERNET_MODEL" || log "WARN: pull failed; daemon will still start (model can be pulled later)"

# ---------------------------------------------------------------------------
# Infernet identity + auth + setup
# ---------------------------------------------------------------------------
log "Initializing identity..."
infernet init --yes \
    --role "$INFERNET_NODE_ROLE" \
    --url "$INFERNET_CONTROL_PLANE" \
    --name "$INFERNET_NODE_NAME"

if [ -n "$INFERNET_BEARER" ]; then
    log "Linking node to account..."
    infernet login --token "$INFERNET_BEARER"
fi

log "Running setup (registers + heartbeats)..."
SETUP_FLAGS="--yes --skip-firewall --model $INFERNET_MODEL"
[ -n "${INFERNET_PUBLIC_ADDRESS:-}" ] && SETUP_FLAGS="$SETUP_FLAGS --address $INFERNET_PUBLIC_ADDRESS"
[ -n "$INFERNET_PUBLIC_PORT" ] && SETUP_FLAGS="$SETUP_FLAGS --port $INFERNET_PUBLIC_PORT"
# shellcheck disable=SC2086
infernet setup $SETUP_FLAGS || log "WARN: setup had errors; starting daemon anyway"

log "Starting daemon in foreground (PORT=$PORT for /healthz)..."
exec infernet start --foreground
