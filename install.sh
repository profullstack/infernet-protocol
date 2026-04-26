#!/bin/sh
# Infernet Protocol — one-line installer for the `infernet` CLI.
#
# Usage:
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
SOURCE_DIR="$INFERNET_HOME/source"
WRAPPER="$INFERNET_BIN/infernet"

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
# dependency checks
# ---------------------------------------------------------------------------
need_node_install_hint() {
    case "$OS" in
        macos)
            cat <<EOF

  Install Node.js 18+ first:

    # via Homebrew:
    brew install node

    # or via nvm:
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    nvm install --lts

EOF
            ;;
        linux)
            cat <<EOF

  Install Node.js 18+ first:

    # NodeSource (Ubuntu/Debian/RHEL):
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs

    # or via nvm:
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    nvm install --lts

EOF
            ;;
    esac
}

check_node() {
    if ! command -v node >/dev/null 2>&1; then
        warn "Node.js not found"
        need_node_install_hint
        fail "install Node.js 18+ and re-run this script"
    fi
    NODE_VER="$(node -v 2>/dev/null | sed 's/^v//')"
    NODE_MAJOR="$(echo "$NODE_VER" | cut -d. -f1)"
    if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
        warn "Node.js $NODE_VER detected — need 18 or later"
        need_node_install_hint
        fail "upgrade Node.js and re-run this script"
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
        ok "pnpm $(pnpm -v) (installed via npm)"
    else
        # corepack ships with Node 16+ and can enable pnpm without npm.
        if command -v corepack >/dev/null 2>&1; then
            corepack enable pnpm >/dev/null 2>&1 || fail "corepack enable pnpm failed"
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
main() {
    printf '\n'
    printf '%sInfernet Protocol installer%s\n' "$BOLD" "$RESET"
    printf '  install dir: %s\n' "$INFERNET_HOME"
    printf '  bin dir:     %s\n' "$INFERNET_BIN"
    printf '  ref:         %s\n' "$INFERNET_REF"
    printf '\n'

    detect_os
    ok "OS: $OS"

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
    printf '\nNext steps:\n'
    printf '  1. infernet setup     # install Ollama + pull a model + open firewall\n'
    printf '  2. infernet chat "hi" # try local inference\n'
    printf '  3. infernet help      # full command list\n'
    printf '\nTo update later, just re-run this installer.\n'
    if [ "$used_npm" = "1" ]; then
        printf 'To uninstall:    npm uninstall -g %s\n\n' "$NPM_PACKAGE"
    else
        printf 'To uninstall:    rm -rf %s && rm -f %s\n\n' "$INFERNET_HOME" "$WRAPPER"
    fi
}

main "$@"
