#!/bin/sh
# Infernet Protocol — one-line installer for the `infernet` CLI.
#
# Usage:
#   curl -fsSL https://infernetprotocol.com/install.sh | sh
#
# Mirror (always pinned to master):
#   curl -fsSL https://raw.githubusercontent.com/profullstack/infernet-protocol/master/install.sh | sh
#
# What it does:
#   1. Detects platform (Linux or macOS — Windows not supported yet).
#   2. Verifies Node.js 18+ is installed (prints how to install if not).
#   3. Installs pnpm if missing.
#   4. Clones the repo to ~/.infernet/source (or pulls if already present).
#   5. Runs `pnpm install` against the workspace.
#   6. Drops a wrapper script at ~/.local/bin/infernet that exec's the CLI.
#   7. Prints next steps (`infernet setup`).
#
# Install strategy:
#   1. If `npm` is available AND the package is published, run
#      `npm install -g @infernetprotocol/cli`. Fast, ~5MB.
#   2. Otherwise fall back to `git clone` + `pnpm install` into
#      ~/.infernet/source and a wrapper at ~/.local/bin/infernet.
#
# The git path stays as a fallback so the installer works even before
# the npm package is published (e.g. for early-access releases).
#
# Override env vars:
#   INFERNET_HOME=/path           install dir for git fallback (~/.infernet)
#   INFERNET_BIN=/path/dir        wrapper bin dir (~/.local/bin)
#   INFERNET_REF=branch           branch/tag/commit for git path (master)
#   INFERNET_NPM_VERSION=X.Y.Z    pin npm version (latest)
#   INFERNET_FORCE_GIT=1          skip npm, force git path
#
# Auto-bootstrap (everything below is optional — the script still works
# without them, but with these set it leaves the node fully running
# without ever needing an interactive `infernet setup` afterwards):
#
#   INFERNET_BEARER=<JWT>         24h CLI bearer minted at /deploy. Auto-links
#                                 the node to the issuing user's account.
#   INFERNET_CONTROL_PLANE=URL    default https://infernetprotocol.com
#   INFERNET_MODEL=name           default qwen2.5:7b
#   INFERNET_NODE_ROLE=role       provider | aggregator | client (default provider)
#   INFERNET_NODE_NAME=name       human-readable name (default $(hostname))
#   INFERNET_PUBLIC_PORT=port     P2P port (default 46337)
#   INFERNET_AUTOSTART=0          set to 0 to install only, skip setup+start
#
# Zero-touch full bootstrap (no SSH afterwards):
#
#   curl -fsSL https://infernetprotocol.com/install.sh \\
#     | INFERNET_BEARER=$TOKEN INFERNET_MODEL=qwen2.5:7b sh
#
# Re-running this script updates an existing install in place.

set -eu

REPO_URL="https://github.com/profullstack/infernet-protocol.git"
REPO_RAW_BASE="https://raw.githubusercontent.com/profullstack/infernet-protocol"
DEFAULT_REF="master"
NPM_PACKAGE="@infernetprotocol/cli"

INFERNET_HOME="${INFERNET_HOME:-$HOME/.infernet}"
INFERNET_BIN="${INFERNET_BIN:-$HOME/.local/bin}"
INFERNET_REF="${INFERNET_REF:-$DEFAULT_REF}"
INFERNET_NPM_VERSION="${INFERNET_NPM_VERSION:-latest}"
INFERNET_FORCE_GIT="${INFERNET_FORCE_GIT:-}"
INFERNET_AUTOSTART="${INFERNET_AUTOSTART:-1}"
INFERNET_CONTROL_PLANE="${INFERNET_CONTROL_PLANE:-https://infernetprotocol.com}"
INFERNET_MODEL="${INFERNET_MODEL:-qwen2.5:7b}"
INFERNET_NODE_ROLE="${INFERNET_NODE_ROLE:-provider}"
INFERNET_NODE_NAME="${INFERNET_NODE_NAME:-$(hostname 2>/dev/null || echo node)}"
INFERNET_PUBLIC_PORT="${INFERNET_PUBLIC_PORT:-46337}"
INFERNET_BIND_PORT="${INFERNET_BIND_PORT:-}"
INFERNET_BEARER="${INFERNET_BEARER:-}"
SOURCE_DIR="$INFERNET_HOME/source"
WRAPPER="$INFERNET_BIN/infernet"

# ---------------------------------------------------------------------------
# Hosting-platform port-mapping detection.
#
# RunPod (and similar GPU clouds) NAT the container — internally the
# daemon listens on 46337, externally the platform maps that to a
# random port like :21517 or :43337. Without this block, the daemon
# would advertise (public_ip, 46337) which nobody can reach. With it,
# we advertise (public_ip, mapped_port) and bind locally to 46337.
#
# Variables consumed downstream:
#   INFERNET_PUBLIC_PORT  — what we advertise to the control plane
#   INFERNET_BIND_PORT    — what the daemon listens on locally
#   INFERNET_PUBLIC_ADDRESS — what we advertise (overrides icanhazip)
# ---------------------------------------------------------------------------
detect_hosting_platform_ports() {
    # RunPod sets RUNPOD_TCP_PORT_<internal>=<external> for every
    # exposed port, and RUNPOD_PUBLIC_IP for the host's edge IP.
    # POSIX sh — no `local`, prefix function-scoped vars with _ to
    # avoid clashing with the global namespace.
    if [ -n "${RUNPOD_PUBLIC_IP:-}" ]; then
        _bind_port="${INFERNET_PUBLIC_PORT:-46337}"
        _mapped_var="RUNPOD_TCP_PORT_${_bind_port}"
        _mapped="$(eval "echo \${$_mapped_var:-}")"
        if [ -n "$_mapped" ]; then
            : "${INFERNET_BIND_PORT:=$_bind_port}"
            INFERNET_PUBLIC_PORT="$_mapped"
            : "${INFERNET_PUBLIC_ADDRESS:=$RUNPOD_PUBLIC_IP}"
            export INFERNET_BIND_PORT INFERNET_PUBLIC_PORT INFERNET_PUBLIC_ADDRESS
            printf '  [hosting] RunPod detected — advertising %s:%s, daemon binds :%s\n' \
                "$INFERNET_PUBLIC_ADDRESS" "$INFERNET_PUBLIC_PORT" "$INFERNET_BIND_PORT"
        fi
        unset _bind_port _mapped_var _mapped
    fi
    # Other platforms can be added here as they're encountered. Default
    # is the no-op case where bind and advertise are the same port.
}
detect_hosting_platform_ports || true

# ---------------------------------------------------------------------------
# pretty output
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    RED=$(printf '\033[31m'); GREEN=$(printf '\033[32m')
    YELLOW=$(printf '\033[33m'); BLUE=$(printf '\033[34m'); BOLD=$(printf '\033[1m'); RESET=$(printf '\033[0m')
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

info()  { printf '%s==>%s %s\n' "$BLUE" "$RESET" "$*"; }
ok()    { printf '%s ✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%s !%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail()  { printf '%s ✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# platform detection
# ---------------------------------------------------------------------------
detect_os() {
    UNAME_S="$(uname -s)"
    case "$UNAME_S" in
        Linux)  OS=linux ;;
        Darwin) OS=macos ;;
        *)      fail "unsupported OS: $UNAME_S (Linux and macOS only)" ;;
    esac
}

# ---------------------------------------------------------------------------
# Sudo + apt-prereq handling
#
# Container images (Docker, RunPod, K8s) usually run as root and may
# not have `sudo` installed; bare-metal / VM operators typically do.
# Resolve once so every privileged step is idempotent regardless.
# ---------------------------------------------------------------------------
if [ "$(id -u 2>/dev/null || echo 0)" = "0" ]; then
    SUDO=""
else
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        SUDO=""
    fi
fi

# Idempotent: only installs missing packages. Safe to re-run any time.
ensure_apt_prereqs() {
    need_pkg() { command -v "$1" >/dev/null 2>&1; }
    _missing=""
    need_pkg curl  || _missing="$_missing curl"
    need_pkg git   || _missing="$_missing git"
    need_pkg zstd  || _missing="$_missing zstd"
    if [ -z "$_missing" ]; then
        unset _missing
        return 0
    fi
    info "installing system prereqs:$_missing"
    if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update -y >/dev/null 2>&1 || true
        # shellcheck disable=SC2086
        $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates $_missing
    elif command -v dnf >/dev/null 2>&1; then
        # shellcheck disable=SC2086
        $SUDO dnf install -y ca-certificates $_missing
    elif command -v yum >/dev/null 2>&1; then
        # shellcheck disable=SC2086
        $SUDO yum install -y ca-certificates $_missing
    elif command -v apk >/dev/null 2>&1; then
        # shellcheck disable=SC2086
        $SUDO apk add --no-cache ca-certificates $_missing
    else
        warn "no apt-get / dnf / yum / apk found — please install$_missing manually"
    fi
    unset _missing
}

# ---------------------------------------------------------------------------
# dependency checks
# ---------------------------------------------------------------------------
need_node_install_hint() {
    cat <<EOF

  Install Node.js 18+ first. Easiest path on any platform:

    curl https://mise.run | sh
    ~/.local/bin/mise use --global node@20

  Then re-run this script.

EOF
}

try_install_node_unattended() {
    # Idempotent: skips if Node 18+ is already on PATH. Otherwise
    # installs Node 20 via mise (a polyglot version manager — single
    # static binary, works on linux + macOS, lives entirely under
    # $HOME so it doesn't fight any system-bundled `node` left over
    # from a base image like RunPod's vllm-workspace, which ships
    # node 12).
    if command -v node >/dev/null 2>&1; then
        _node_v="$(node -v | sed 's/^v//')"
        _node_major="$(echo "$_node_v" | cut -d. -f1)"
        if [ "${_node_major:-0}" -ge 18 ]; then
            unset _node_v _node_major
            return 0
        fi
        unset _node_v _node_major
    fi

    info "installing Node.js 20 via mise (https://mise.jdx.dev)"
    if ! command -v mise >/dev/null 2>&1; then
        # Official one-liner. Drops the binary at ~/.local/bin/mise.
        curl -fsSL https://mise.run | sh >/dev/null 2>&1 || {
            warn "mise install failed (curl https://mise.run | sh)"
            return 1
        }
    fi

    # Make sure mise + its shims are on PATH for the rest of this
    # script — without this, downstream `node` / `npm` calls would
    # still resolve to the stale system version.
    PATH="$HOME/.local/bin:$PATH"
    if ! command -v mise >/dev/null 2>&1; then
        warn "mise installed but not on PATH at $HOME/.local/bin"
        return 1
    fi
    mise install node@20 >/dev/null 2>&1 || warn "mise install node@20 failed"
    mise use --global node@20 >/dev/null 2>&1 || warn "mise use --global node@20 failed"

    _mise_data="${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}"
    PATH="$_mise_data/shims:$PATH"
    export PATH
    unset _mise_data

    command -v node >/dev/null 2>&1 && return 0
    return 1
}

check_node() {
    if ! command -v node >/dev/null 2>&1; then
        info "Node.js not found — attempting unattended install"
        try_install_node_unattended || {
            warn "could not install Node.js automatically"
            need_node_install_hint
            fail "install Node.js 18+ and re-run this script"
        }
    fi
    NODE_VER="$(node -v 2>/dev/null | sed 's/^v//')"
    NODE_MAJOR="$(echo "$NODE_VER" | cut -d. -f1)"
    if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
        warn "Node.js $NODE_VER detected — need 18 or later"
        try_install_node_unattended || {
            need_node_install_hint
            fail "upgrade Node.js and re-run this script"
        }
        NODE_VER="$(node -v 2>/dev/null | sed 's/^v//')"
    fi
    ok "Node.js v$NODE_VER"
}

check_git() {
    if ! command -v git >/dev/null 2>&1; then
        case "$OS" in
            macos) fail "git not found — run 'xcode-select --install' first" ;;
            linux) fail "git not found — install with your distro package manager (e.g. apt install git)" ;;
        esac
    fi
    ok "git $(git --version | awk '{print $3}')"
}

ensure_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        ok "pnpm $(pnpm -v)"
        return 0
    fi
    info "installing pnpm…"
    if command -v npm >/dev/null 2>&1; then
        npm install -g pnpm >/dev/null 2>&1 || fail "npm install -g pnpm failed"
        # If we installed node via mise, expose the freshly-installed
        # pnpm binary through mise's shim layer so it's found on PATH.
        command -v mise >/dev/null 2>&1 && mise reshim >/dev/null 2>&1 || true
        ok "pnpm $(pnpm -v) (installed via npm)"
    else
        # corepack ships with Node 16+ and can enable pnpm without npm.
        if command -v corepack >/dev/null 2>&1; then
            corepack enable pnpm >/dev/null 2>&1 || fail "corepack enable pnpm failed"
            command -v mise >/dev/null 2>&1 && mise reshim >/dev/null 2>&1 || true
            ok "pnpm enabled via corepack"
        else
            fail "neither npm nor corepack found — can't install pnpm"
        fi
    fi
}

# ---------------------------------------------------------------------------
# install / update repo
# ---------------------------------------------------------------------------
clone_or_update() {
    mkdir -p "$INFERNET_HOME"
    if [ -d "$SOURCE_DIR/.git" ]; then
        info "updating existing install at $SOURCE_DIR"
        git -C "$SOURCE_DIR" fetch --depth 1 origin "$INFERNET_REF" >/dev/null 2>&1 \
            || fail "git fetch failed"
        git -C "$SOURCE_DIR" reset --hard "FETCH_HEAD" >/dev/null 2>&1 \
            || fail "git reset failed"
        ok "fetched $INFERNET_REF"
    else
        info "cloning $REPO_URL to $SOURCE_DIR"
        git clone --depth 1 --branch "$INFERNET_REF" "$REPO_URL" "$SOURCE_DIR" >/dev/null 2>&1 \
            || fail "git clone failed"
        ok "cloned $INFERNET_REF"
    fi
}

run_install() {
    info "running pnpm install (this may take a minute)"
    (cd "$SOURCE_DIR" && pnpm install --silent --prefer-offline 2>&1) | tail -5
    ok "dependencies installed"
}

# ---------------------------------------------------------------------------
# bin shim
# ---------------------------------------------------------------------------
write_wrapper() {
    mkdir -p "$INFERNET_BIN"
    cat > "$WRAPPER" <<EOF
#!/bin/sh
# Infernet CLI shim — points at the install at $SOURCE_DIR.
# If node was installed via mise, prepend its shims so the right
# version is picked up regardless of whether the user's shell
# config has activated mise yet (containers, fresh logins, cron).
_mise_data="\${MISE_DATA_DIR:-\${XDG_DATA_HOME:-\$HOME/.local/share}/mise}"
[ -d "\$_mise_data/shims" ] && PATH="\$_mise_data/shims:\$PATH"
exec node "$SOURCE_DIR/apps/cli/index.js" "\$@"
EOF
    chmod +x "$WRAPPER"
    ok "wrapper installed at $WRAPPER"
}

# Try installing via npm. Returns 0 on success (binary now on PATH via
# npm's global prefix), 1 to fall back to the git clone path.
try_npm_install() {
    if ! command -v npm >/dev/null 2>&1; then
        return 1
    fi
    info "trying $NPM_PACKAGE@$INFERNET_NPM_VERSION via npm..."
    NPM_LOG="$(mktemp 2>/dev/null || echo "/tmp/inf-npm.$$.log")"
    if npm install -g "$NPM_PACKAGE@$INFERNET_NPM_VERSION" >"$NPM_LOG" 2>&1; then
        ok "installed via npm"
        rm -f "$NPM_LOG"
        return 0
    fi
    # 404 means the package isn't published yet — expected today, not an
    # error worth shouting about. Anything else, surface enough to debug.
    if grep -q "E404" "$NPM_LOG" 2>/dev/null; then
        warn "$NPM_PACKAGE not on npm yet — falling back to git clone"
    else
        warn "npm install failed — falling back to git clone"
        printf '  hint: %s\n' "$(tail -3 "$NPM_LOG" 2>/dev/null | head -1)"
        printf '  full log: %s\n' "$NPM_LOG"
    fi
    return 1
}

check_npm_path() {
    NPM_BIN="$(npm bin -g 2>/dev/null || npm prefix -g 2>/dev/null | sed 's|$|/bin|')"
    case ":$PATH:" in
        *":$NPM_BIN:"*)
            return 0
            ;;
    esac
    warn "$NPM_BIN is not on your PATH"
    cat <<EOF

  npm installed the binary to $NPM_BIN but that directory isn't on
  your PATH. Either add it (export PATH="$NPM_BIN:\$PATH") or use the
  full path: $NPM_BIN/infernet

EOF
}

check_path() {
    case ":$PATH:" in
        *":$INFERNET_BIN:"*)
            return 0
            ;;
    esac
    warn "$INFERNET_BIN is not on your PATH"
    SHELL_RC=""
    case "${SHELL:-}" in
        */zsh)  SHELL_RC="$HOME/.zshrc" ;;
        */bash) SHELL_RC="$HOME/.bashrc" ;;
        */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
    esac
    cat <<EOF

  Add this to your shell startup file (e.g. $SHELL_RC):

      export PATH="$INFERNET_BIN:\$PATH"

  Or run the CLI by full path: $WRAPPER

EOF
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
# Native auto-bootstrap — after install completes, run `infernet setup`
# automatically (and `infernet login --token` if a bearer was provided)
# so the user never has to ssh in to finish the setup.
# ---------------------------------------------------------------------------
auto_bootstrap_native() {
    if [ "$INFERNET_AUTOSTART" = "0" ]; then
        info "INFERNET_AUTOSTART=0 — skipping setup. Run 'infernet setup' manually when ready."
        return 0
    fi

    INFERNET_CMD="$WRAPPER"
    [ -x "$INFERNET_CMD" ] || INFERNET_CMD="infernet"

    if [ -n "$INFERNET_BEARER" ]; then
        info "running infernet init + login (bearer provided)"
        export INFERNET_NONINTERACTIVE=1
        "$INFERNET_CMD" init --yes \
            --role "$INFERNET_NODE_ROLE" \
            --url "$INFERNET_CONTROL_PLANE" \
            --name "$INFERNET_NODE_NAME" >/dev/null 2>&1 || warn "infernet init had issues"
        "$INFERNET_CMD" login --token "$INFERNET_BEARER" >/dev/null 2>&1 || warn "infernet login --token failed"
    fi

    info "running infernet setup --yes (this takes a few minutes the first time)"
    export INFERNET_NONINTERACTIVE=1
    "$INFERNET_CMD" setup --yes --model "$INFERNET_MODEL" --port "$INFERNET_PUBLIC_PORT" \
        || warn "infernet setup exited with errors — re-run 'infernet setup' to retry"
}

main() {
    printf '\n'
    printf '%sInfernet Protocol installer%s\n' "$BOLD" "$RESET"
    printf '  install dir: %s\n' "$INFERNET_HOME"
    printf '  bin dir:     %s\n' "$INFERNET_BIN"
    printf '  ref:         %s\n' "$INFERNET_REF"
    printf '\n'

    detect_os
    ok "OS: $OS"

    # Idempotent — only installs missing packages. Cheap to call.
    ensure_apt_prereqs

    check_node

    if [ -z "$INFERNET_FORCE_GIT" ] && try_npm_install; then
        check_npm_path
        used_npm=1
    else
        check_git
        ensure_pnpm
        clone_or_update
        run_install
        write_wrapper
        check_path
        used_npm=0
    fi

    printf '\n%sInstall complete.%s\n' "$GREEN" "$RESET"

    auto_bootstrap_native

    printf '\nUse:\n'
    printf '  infernet status       # daemon state\n'
    printf '  infernet chat "hi"    # local + P2P inference\n'
    printf '  infernet debug        # diagnostic bundle for support\n'
    printf '  infernet help         # full command list\n'
    printf '\nTo update later, just re-run this installer.\n'
    if [ "$used_npm" = "1" ]; then
        printf 'To uninstall:    npm uninstall -g %s\n\n' "$NPM_PACKAGE"
    else
        printf 'To uninstall:    rm -rf %s && rm -f %s\n\n' "$INFERNET_HOME" "$WRAPPER"
    fi
}

main "$@"
