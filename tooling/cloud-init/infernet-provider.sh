#!/usr/bin/env bash
#
# Infernet Protocol — universal cloud-init bootstrap for a provider node.
#
# Designed to be downloaded fresh on each VM boot:
#
#   curl -fsSL https://infernetprotocol.com/api/deploy/cloud-init?token=<JWT> | bash
#
# Works on any Linux box with curl, sudo, and 2+ GB RAM. DigitalOcean
# Droplets, RunPod custom-image pods, AWS / GCP VMs, bare-metal — same
# script. The token query param is a short-lived CLI bearer minted from
# /deploy that auto-links the new node to the user's account.
#
# Env vars the caller can override (cloud-init `runcmd` can `export`
# them before piping this script):
#
#   INFERNET_BEARER          one-time JWT (also accepted as ?token= in URL)
#   INFERNET_CONTROL_PLANE   default: https://infernetprotocol.com
#   INFERNET_MODEL           default: qwen2.5:7b — what to pull + serve
#   INFERNET_NODE_ROLE       default: provider
#   INFERNET_NODE_NAME       default: hostname
#   INFERNET_PUBLIC_ADDRESS  default: auto-detected via icanhazip.com
#   INFERNET_PUBLIC_PORT     default: 46337
#
# Side effects:
#   - apt/yum-installs curl + ollama if missing
#   - downloads ~/.infernet/source via the official installer
#   - runs `infernet init`, `infernet login --token`, `infernet setup --yes`
#   - tail-execs `infernet start --foreground` so cloud platforms keep
#     the node alive

set -euo pipefail

# Force every Infernet CLI subcommand into non-interactive mode. There's
# no user to say yes/no inside cloud-init — Docker entrypoints, RunPod
# pod start commands, cron, headless droplet boot. The CLI's setup /
# init / register / login paths all treat this as "auto-accept defaults."
export INFERNET_NONINTERACTIVE=1

log() { printf '\n[infernet-provider] %s\n' "$*"; }
fail() { printf '\n[infernet-provider] ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Config (env-overridable)
# ---------------------------------------------------------------------------
INFERNET_CONTROL_PLANE="${INFERNET_CONTROL_PLANE:-https://infernetprotocol.com}"
INFERNET_MODEL="${INFERNET_MODEL:-qwen2.5:7b}"
INFERNET_NODE_ROLE="${INFERNET_NODE_ROLE:-provider}"
INFERNET_NODE_NAME="${INFERNET_NODE_NAME:-$(hostname)}"
INFERNET_PUBLIC_PORT="${INFERNET_PUBLIC_PORT:-46337}"
INFERNET_BEARER="${INFERNET_BEARER:-}"

# Best-effort public IP detection. Fallback to whatever the host
# reports — operators on private networks can override.
if [ -z "${INFERNET_PUBLIC_ADDRESS:-}" ]; then
    INFERNET_PUBLIC_ADDRESS="$(curl -fsS --max-time 3 https://icanhazip.com 2>/dev/null \
        || curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null \
        || hostname -I | awk '{print $1}' \
        || echo "")"
fi

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
log "control plane: $INFERNET_CONTROL_PLANE"
log "model:         $INFERNET_MODEL"
log "public addr:   ${INFERNET_PUBLIC_ADDRESS:-(auto-detect failed)}"
log "public port:   $INFERNET_PUBLIC_PORT"

if ! command -v curl >/dev/null 2>&1; then
    log "Installing curl..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y curl ca-certificates
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y curl ca-certificates
    else
        fail "no apt-get or yum found — install curl manually then re-run"
    fi
fi

# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------
if ! command -v ollama >/dev/null 2>&1; then
    log "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
fi

if ! pgrep -x ollama >/dev/null 2>&1; then
    log "Starting Ollama in the background..."
    nohup ollama serve >/tmp/ollama.log 2>&1 &
    sleep 2
fi

# Wait for Ollama to accept connections (max ~30s)
for _ in $(seq 1 30); do
    if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
done

log "Pulling model $INFERNET_MODEL (this may take a few minutes on slow networks)..."
ollama pull "$INFERNET_MODEL"

# ---------------------------------------------------------------------------
# Infernet CLI
# ---------------------------------------------------------------------------
if ! command -v infernet >/dev/null 2>&1; then
    log "Installing Infernet CLI..."
    curl -fsSL "$INFERNET_CONTROL_PLANE/install.sh" | sh
    # The installer drops the wrapper at ~/.local/bin/infernet — make
    # sure it's on PATH for the rest of this script.
    export PATH="$HOME/.local/bin:$PATH"
fi

log "Initializing identity..."
infernet init --yes \
    --role "$INFERNET_NODE_ROLE" \
    --url "$INFERNET_CONTROL_PLANE" \
    --name "$INFERNET_NODE_NAME"

if [ -n "$INFERNET_BEARER" ]; then
    log "Linking node to account via bearer token..."
    infernet login --token "$INFERNET_BEARER"
fi

# ---------------------------------------------------------------------------
# Setup + run
# ---------------------------------------------------------------------------
log "Running infernet setup (registers + starts heartbeats)..."
SETUP_FLAGS="--yes"
[ -n "${INFERNET_PUBLIC_ADDRESS:-}" ] && SETUP_FLAGS="$SETUP_FLAGS --address $INFERNET_PUBLIC_ADDRESS"
[ -n "$INFERNET_PUBLIC_PORT" ] && SETUP_FLAGS="$SETUP_FLAGS --port $INFERNET_PUBLIC_PORT"

# Setup is self-healing: it will register, link the pubkey if logged in,
# and restart the daemon as needed.
# shellcheck disable=SC2086
infernet setup $SETUP_FLAGS --skip-firewall

log "Setup complete. Starting daemon in foreground (cloud platform keeps it alive)..."
exec infernet start --foreground
