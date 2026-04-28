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
#   INFERNET_MIN_DISK_MB=N        override disk-space threshold (3 / 10 / 15 GB)
#   INFERNET_SKIP_DISK_CHECK=1    skip the disk-space preflight
#   INFERNET_NO_RELOCATE=1        keep install at $HOME even if a bigger
#                                 volume is mounted (default: relocate to
#                                 the biggest writable mount when it has
#                                 ≥2x more free space than $HOME)
#
# Engine selection (optional):
#
#   INFERNET_INSTALL_VLLM=0       skip vLLM install even on NVIDIA
#   INFERNET_INSTALL_VLLM=1       force vLLM install (fails on non-NVIDIA)
#   INFERNET_VLLM_MODEL=name      auto-start `vllm serve <name>` in background
#                                 after install (e.g. Qwen/Qwen2.5-7B-Instruct)
#
# Ray cluster (optional, for multi-GPU / multi-node vLLM serving):
#
#   INFERNET_RAY_MODE=head        start a Ray head on this box (port 6379)
#   INFERNET_RAY_MODE=worker      join an existing Ray cluster
#   INFERNET_RAY_HEAD=host:port   address of the Ray head (when MODE=worker)
#   INFERNET_RAY_PORT=6379        head port (default 6379)
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
#   INFERNET_NODE_NAME=name       human-readable name (default user@host)
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
# Leave INFERNET_NODE_NAME unset by default so `infernet init` can
# generate the user@host:slug default itself (it has access to nodeId,
# we don't here). Operators who want a custom name set this env var
# explicitly; otherwise auto_bootstrap_native skips passing --name.
INFERNET_NODE_NAME="${INFERNET_NODE_NAME:-}"
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
# Big-volume relocation (host-agnostic).
#
# Many GPU hosts have a small root filesystem (5–20 GB overlay) and a
# big persistent volume mounted somewhere else:
#   RunPod         /workspace       (or /vllm-workspace, /runpod-volume)
#   Vast.ai        /workspace       (or /data)
#   Lambda Labs    /lambda          (or /home/$user — already-big-fs case)
#   bare metal     /mnt/<whatever>  whatever the operator mounted
#
# Rather than special-case every platform, scan `df -P` for the
# writable mount with the most free space (excluding $HOME's own
# filesystem and anything virtual/system) and relocate the install
# there if it offers materially more headroom than $HOME.
#
# Relocates everything we can:
#   INFERNET_HOME   → $VOLUME/infernet      (clone + node_modules)
#   INFERNET_BIN    → $VOLUME/infernet/bin  (wrapper + mise binary)
#   MISE_DATA_DIR   → $VOLUME/mise          (node 20)
#   OLLAMA_MODELS   → $VOLUME/ollama-models (model blobs)
#   PNPM_HOME       → $VOLUME/pnpm          (pnpm store)
#   /usr/local/lib/ollama → symlink → $VOLUME/ollama-libs (CUDA libs)
#
# The /usr/local/lib/ollama symlink is the load-bearing one: it's
# where Ollama's installer extracts the ~3 GB mlx_cuda_v13 + cudnn
# tarball. We pre-create the symlink so the extract lands on the big
# disk instead of filling up the root overlay.
#
# Opt out: set INFERNET_HOME explicitly, OR set INFERNET_NO_RELOCATE=1.
# ---------------------------------------------------------------------------
detect_install_volume() {
    [ "${INFERNET_NO_RELOCATE:-}" = "1" ] && return 0
    # If user set INFERNET_HOME explicitly, respect it.
    [ "$INFERNET_HOME" = "$HOME/.infernet" ] || return 0

    _home_mp="$(df -P "$HOME" 2>/dev/null | awk 'NR==2 {print $6}')"
    _home_kb="$(df -P "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')"
    [ -n "$_home_mp" ] || return 0

    _best_mp=""
    _best_kb=0
    # Scan every mounted fs, pick the writable one with the most
    # free space that isn't $HOME's mount and isn't virtual/system.
    while read -r _fs _blocks _used _avail _capacity _mp; do
        case "$_fs" in
            tmpfs|devtmpfs|overlay|proc|sysfs|cgroup*|mqueue|securityfs|pstore|debugfs|tracefs|configfs|fusectl|none|squashfs|nsfs|hugetlbfs|binfmt_misc|autofs)
                continue ;;
        esac
        case "$_mp" in
            /|/proc|/proc/*|/sys|/sys/*|/dev|/dev/*|/run|/run/*|/boot|/boot/*|/etc|/etc/*|/usr|/usr/*|/var/lib/docker*|/snap|/snap/*|/tmp)
                continue ;;
        esac
        [ "$_mp" = "$_home_mp" ] && continue
        [ -w "$_mp" ] || continue
        # Must have at least 10 GB free to be worth relocating to.
        [ "${_avail:-0}" -lt 10485760 ] && continue
        if [ "$_avail" -gt "$_best_kb" ]; then
            _best_kb="$_avail"
            _best_mp="$_mp"
        fi
    done <<EOF
$(df -P 2>/dev/null | tail -n +2)
EOF

    [ -z "$_best_mp" ] && return 0

    # Only relocate if the volume has at least 2x more free space than
    # $HOME — guards against e.g. a 16 GB USB drive on a desktop with
    # 200 GB free at $HOME.
    if [ "$_best_kb" -lt $(( ${_home_kb:-0} * 2 )) ]; then
        return 0
    fi

    INFERNET_HOME="$_best_mp/infernet"
    INFERNET_BIN="$INFERNET_HOME/bin"
    SOURCE_DIR="$INFERNET_HOME/source"
    WRAPPER="$INFERNET_BIN/infernet"

    MISE_DATA_DIR="$_best_mp/mise"
    MISE_INSTALL_PATH="$INFERNET_BIN/mise"
    OLLAMA_MODELS="$_best_mp/ollama-models"
    PNPM_HOME="$_best_mp/pnpm"
    export MISE_DATA_DIR MISE_INSTALL_PATH OLLAMA_MODELS PNPM_HOME

    # Pre-create the Ollama lib symlink so its installer's tar extract
    # lands on the volume. Skip if /usr/local/lib/ollama already exists
    # as a directory (failed prior install — operator must clean up).
    mkdir -p "$_best_mp/ollama-libs" 2>/dev/null || true
    if [ -L /usr/local/lib/ollama ] || [ ! -e /usr/local/lib/ollama ]; then
        mkdir -p /usr/local/lib 2>/dev/null || true
        rm -f /usr/local/lib/ollama 2>/dev/null || true
        ln -sf "$_best_mp/ollama-libs" /usr/local/lib/ollama 2>/dev/null || true
    fi

    # Symlink ~/.X dirs the daemon + tooling write to — daemon config,
    # identity, daemon.log, mise's config, ollama's blobs cache, etc.
    # Each is just a symlink (a few bytes on the overlay), but the
    # writes that follow them all land on the big volume.
    relocate_dot_dir() {
        # $1 = relative path under $HOME (e.g. ".config/infernet")
        _src="$HOME/$1"
        _dst="$_best_mp/$1"
        mkdir -p "$_dst" 2>/dev/null || true
        # Make sure parent of $_src exists on the overlay.
        mkdir -p "$(dirname "$_src")" 2>/dev/null || true
        if [ -L "$_src" ] || [ ! -e "$_src" ]; then
            rm -f "$_src" 2>/dev/null || true
            ln -sf "$_dst" "$_src" 2>/dev/null || true
        elif [ -d "$_src" ] && [ -z "$(ls -A "$_src" 2>/dev/null)" ]; then
            # Empty real dir — replace with symlink.
            rmdir "$_src" 2>/dev/null && ln -sf "$_dst" "$_src" 2>/dev/null || true
        fi
        unset _src _dst
    }
    relocate_dot_dir ".config/infernet"
    # NOTE: do NOT symlink ~/.config/mise — mise canonicalizes config
    # paths when storing trust state, and a symlinked config dir
    # creates a path-resolution mismatch where `mise trust` records
    # one path and child processes look up another. The config is
    # tiny (~50 bytes), keeping it on the overlay is fine.
    relocate_dot_dir ".cache/infernet"
    relocate_dot_dir ".ollama"

    _free_g=$(( _best_kb / 1024 / 1024 ))
    _home_g=$(( ${_home_kb:-0} / 1024 / 1024 ))
    printf '  [storage] big volume at %s (%s GB free) — relocating install off $HOME (%s GB)\n' \
        "$_best_mp" "$_free_g" "$_home_g"
    printf '            INFERNET_HOME=%s\n' "$INFERNET_HOME"
    printf '            OLLAMA_MODELS=%s\n' "$OLLAMA_MODELS"
    printf '            /usr/local/lib/ollama → %s/ollama-libs\n' "$_best_mp"
    printf '            ~/.config/infernet, ~/.cache/infernet, ~/.ollama → %s/...\n' "$_best_mp"
    unset _home_mp _home_kb _best_mp _best_kb _fs _blocks _used _avail _capacity _mp _free_g _home_g
}
detect_install_volume || true

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
# disk-space preflight
#
# Realistic disk math for a zero-touch bearer install on a CUDA box:
#   pnpm install (monorepo) ........ ~2.0 GB
#   Node 20 via mise ............... ~0.1 GB
#   Ollama base binary ............. ~1.0 GB
#   Ollama mlx_cuda_v13 libs ....... ~3.0 GB  (only on CUDA hosts)
#   Ollama vulkan libs ............. ~0.3 GB
#   Model qwen2.5:7b ............... ~4.4 GB
#   Model qwen3.5-uncensored:9b .... ~7.4 GB
#   tar-extract peak (2x of one lib) ~1.0 GB headroom
#                                    ───────
#   minimum, CUDA host + 7B model ..  ~12 GB
#   minimum, CUDA host + 9B model ..  ~15 GB
#
# Failing halfway through tar-extracting CUDA libs (or worse, a 7 GB
# model pull) is a brutal UX — bail loudly up front instead.
#
# Override:
#   INFERNET_MIN_DISK_MB=N      override threshold (defaults below)
#   INFERNET_SKIP_DISK_CHECK=1  skip the check entirely
# ---------------------------------------------------------------------------
free_mb_at() {
    _path="$1"
    [ -d "$_path" ] || _path="$(dirname "$_path")"
    # df -P prints sizes in 1K-blocks portably (linux + macOS + busybox).
    _kb="$(df -P "$_path" 2>/dev/null | awk 'NR==2 {print $4}')"
    if [ -z "$_kb" ] || [ "$_kb" = "0" ]; then
        echo 0
    else
        echo "$((_kb / 1024))"
    fi
    unset _path _kb
}

check_disk_space() {
    if [ "${INFERNET_SKIP_DISK_CHECK:-}" = "1" ]; then
        return 0
    fi
    # Default 3 GB without bearer (just the install).
    # With bearer + auto-bootstrap, the math depends on whether Ollama
    # will pull CUDA libs (~3 GB extra). Detect by presence of nvidia-smi
    # — if missing, the Ollama install path is the lighter CPU/Vulkan one.
    if [ -n "$INFERNET_BEARER" ]; then
        if command -v nvidia-smi >/dev/null 2>&1; then
            # 15 GB Ollama+CUDA + 5 GB vLLM venv + 5 GB headroom for tar peaks
            _default_need=25600   # 25 GB — Ollama+CUDA + vLLM + ~7 GB model + headroom
        else
            _default_need=10240   # 10 GB — install + Ollama (no CUDA) + model + headroom
        fi
    else
        _default_need=3072
    fi
    _need_mb="${INFERNET_MIN_DISK_MB:-$_default_need}"
    # Measure the filesystem where the install will actually land. After
    # detect_install_volume runs, INFERNET_HOME may point at a big volume
    # while $HOME is on a tiny overlay — checking $HOME would warn
    # spuriously about disk that doesn't matter for the install.
    _check_path="$INFERNET_HOME"
    [ -d "$_check_path" ] || _check_path="$(dirname "$_check_path")"
    [ -d "$_check_path" ] || _check_path="$HOME"
    _free_mb="$(free_mb_at "$_check_path")"
    # df unavailable / unknown filesystem — best-effort: don't block.
    if [ "${_free_mb:-0}" = "0" ]; then
        warn "could not check disk space at $_check_path — continuing anyway"
        unset _default_need _need_mb _free_mb _check_path
        return 0
    fi
    if [ "$_free_mb" -lt "$_need_mb" ]; then
        warn "low disk: ${_free_mb} MB free at $_check_path, need ~${_need_mb} MB"
        warn "free up space (e.g. 'pnpm store prune', 'docker system prune') and re-run."
        warn "to override: INFERNET_MIN_DISK_MB=$_free_mb or INFERNET_SKIP_DISK_CHECK=1"
        fail "insufficient disk space"
    fi
    if [ "$_free_mb" -lt $((_need_mb * 2)) ]; then
        warn "tight disk: ${_free_mb} MB free at $_check_path — recommended >$((_need_mb * 2)) MB"
    else
        ok "disk: ${_free_mb} MB free at $_check_path"
    fi
    unset _default_need _need_mb _free_mb _check_path
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
        $SUDO apt-get update -y || true
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
    # Resolve where mise binary will land: $MISE_INSTALL_PATH if set
    # by detect_install_volume (volume-relocation case), else default.
    _mise_bin="${MISE_INSTALL_PATH:-$HOME/.local/bin/mise}"
    # Pre-create the install dir so mise.run doesn't have to.
    mkdir -p "$(dirname "$_mise_bin")" 2>/dev/null || true
    if [ ! -x "$_mise_bin" ]; then
        # Official one-liner. Honors $MISE_INSTALL_PATH for the binary
        # location, $MISE_DATA_DIR for installed tools. Don't gag the
        # installer's output — it downloads ~30 MB and the user wants
        # to see progress, not stare at a silent terminal.
        #
        # Filter known-harmless mv warnings through awk so they read as
        # "warn:" lines instead of looking like real failures. mise.run
        # extracts to /tmp (overlay) and `mv`s to MISE_INSTALL_PATH; on
        # network filesystems (RunPod's MooseFS, NFS, SMB) the chown
        # step fails but the file copy succeeds, so the binary works
        # fine. Exit-code check is the trailing -x test on $_mise_bin.
        info "  → downloading mise binary (~30 MB) from mise.run"
        curl -fsSL https://mise.run | sh 2>&1 | awk '
            /failed to preserve ownership|cannot preserve ownership/ {
                printf "  ! warn: %s (harmless on network FS — mv across mounts)\n", $0
                next
            }
            { print }
        '
    fi
    if [ ! -x "$_mise_bin" ]; then
        # mise.run sometimes defaults differently — fall back to common spots.
        for _candidate in "$INFERNET_BIN/mise" "$HOME/.local/bin/mise" /usr/local/bin/mise; do
            if [ -x "$_candidate" ]; then _mise_bin="$_candidate"; break; fi
        done
        unset _candidate
    fi
    if [ ! -x "$_mise_bin" ]; then
        warn "mise installed but binary not found (tried $INFERNET_BIN, $HOME/.local/bin, /usr/local/bin)"
        unset _mise_bin
        return 1
    fi
    ok "mise: $_mise_bin"

    # Auto-confirm any trust prompts (non-interactive install).
    MISE_YES=1
    export MISE_YES

    # Use mise by absolute path — no PATH dependency. Stream output
    # so the user can see what's happening (Node 20 download is ~80 MB
    # and takes 30-60s on a fresh box; gagging it makes the script
    # look hung).
    info "  → installing Node 20 (~80 MB)"
    "$_mise_bin" install node@20 || warn "mise install node@20 failed"
    "$_mise_bin" use --global node@20 || warn "mise use --global node@20 failed"

    # Trust the config we just wrote. mise refuses to read untrusted
    # config.toml files (security feature) and `mise use --global`
    # writes a fresh one — without this, every subsequent `node` /
    # `npm` invocation through mise's shim layer prints "Config files
    # are not trusted" and exits non-zero, breaking pnpm subprocess
    # scripts. Trust BOTH the symlink path and the canonical path
    # (mise canonicalizes paths internally and child processes may
    # look up either form).
    _mise_global_cfg="$HOME/.config/mise/config.toml"
    if [ -f "$_mise_global_cfg" ]; then
        "$_mise_bin" trust "$_mise_global_cfg" >/dev/null 2>&1 || true
        _mise_canon="$(readlink -f "$_mise_global_cfg" 2>/dev/null || echo "$_mise_global_cfg")"
        if [ "$_mise_canon" != "$_mise_global_cfg" ]; then
            "$_mise_bin" trust "$_mise_canon" >/dev/null 2>&1 || true
        fi
        unset _mise_canon
    fi
    # Belt-and-suspenders: allowlist parent dirs via env var so future
    # invocations don't re-trip trust. Include both possible paths.
    _mise_cfg_dirs="$HOME/.config/mise"
    if [ -L "$HOME/.config/mise" ]; then
        _mise_cfg_dirs="$_mise_cfg_dirs:$(readlink -f "$HOME/.config/mise" 2>/dev/null)"
    fi
    MISE_TRUSTED_CONFIG_PATHS="$_mise_cfg_dirs"
    export MISE_TRUSTED_CONFIG_PATHS
    unset _mise_global_cfg _mise_cfg_dirs

    # Now expose the shims so plain `node` / `npm` works for the rest
    # of the script and for the wrapper at runtime.
    _mise_data="${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}"
    PATH="$(dirname "$_mise_bin"):$_mise_data/shims:$PATH"
    export PATH
    unset _mise_bin _mise_data

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
        npm install -g pnpm || fail "npm install -g pnpm failed"
        # If we installed node via mise, expose the freshly-installed
        # pnpm binary through mise's shim layer so it's found on PATH.
        command -v mise >/dev/null 2>&1 && mise reshim >/dev/null 2>&1 || true
        ok "pnpm $(pnpm -v) (installed via npm)"
    else
        # corepack ships with Node 16+ and can enable pnpm without npm.
        if command -v corepack >/dev/null 2>&1; then
            corepack enable pnpm || fail "corepack enable pnpm failed"
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
        git -C "$SOURCE_DIR" fetch --depth 1 --progress origin "$INFERNET_REF" \
            || fail "git fetch failed"
        git -C "$SOURCE_DIR" reset --hard "FETCH_HEAD" \
            || fail "git reset failed"
        ok "fetched $INFERNET_REF"
    else
        info "cloning $REPO_URL to $SOURCE_DIR"
        git clone --depth 1 --branch "$INFERNET_REF" --progress "$REPO_URL" "$SOURCE_DIR" \
            || fail "git clone failed"
        ok "cloned $INFERNET_REF"
    fi
}

# ---------------------------------------------------------------------------
# GPU vendor detection + vLLM install (NVIDIA only).
#
# Ollama covers every box we care about (NVIDIA / AMD / Apple Silicon /
# CPU). vLLM only runs on NVIDIA + CUDA 12.x. When we see nvidia-smi we
# install vLLM in addition to Ollama so the operator gets the high-
# throughput option as well — auto-select picks vLLM ahead of Ollama if
# both are running (IPIP-0009).
#
# Opt-out: INFERNET_INSTALL_VLLM=0
# Force on (will fail loudly without nvidia-smi): INFERNET_INSTALL_VLLM=1
# Auto-start vllm serve <model>: set INFERNET_VLLM_MODEL=<repo/name>
# ---------------------------------------------------------------------------
detect_gpu_vendor() {
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
        echo nvidia
    elif command -v rocm-smi >/dev/null 2>&1; then
        echo amd
    elif [ "$OS" = "macos" ] && system_profiler SPDisplaysDataType 2>/dev/null | grep -q "Apple"; then
        echo apple
    else
        echo none
    fi
}

try_install_vllm() {
    # Skip if explicitly disabled, or if not on NVIDIA.
    case "${INFERNET_INSTALL_VLLM:-auto}" in
        0|no|false|"") return 0 ;;
    esac
    GPU_VENDOR="$(detect_gpu_vendor)"
    if [ "$GPU_VENDOR" != "nvidia" ]; then
        if [ "${INFERNET_INSTALL_VLLM:-auto}" = "1" ] || [ "${INFERNET_INSTALL_VLLM:-auto}" = "yes" ]; then
            warn "INFERNET_INSTALL_VLLM=1 set but no NVIDIA GPU detected — vLLM is NVIDIA-only"
            return 1
        fi
        info "non-NVIDIA host ($GPU_VENDOR) — skipping vLLM (Ollama covers this hardware)"
        return 0
    fi

    info "NVIDIA GPU detected — installing vLLM alongside Ollama"
    _vllm_dir="$INFERNET_HOME/vllm-venv"

    # Need Python 3.11 in the venv. mise can install it; reuse the
    # binary we already provisioned for Node.
    _mise_bin="${MISE_INSTALL_PATH:-$HOME/.local/bin/mise}"
    if [ -x "$_mise_bin" ]; then
        info "  → installing Python 3.11 via mise"
        "$_mise_bin" install python@3.11 || warn "mise install python@3.11 failed"
        "$_mise_bin" use --global python@3.11 || warn "mise use --global python@3.11 failed"
        # Re-trust after mise rewrites config.toml.
        "$_mise_bin" trust "$HOME/.config/mise/config.toml" >/dev/null 2>&1 || true
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        warn "python3 not on PATH — can't install vLLM. Set INFERNET_INSTALL_VLLM=0 to silence."
        unset _vllm_dir _mise_bin
        return 1
    fi

    info "  → creating venv at $_vllm_dir"
    if ! python3 -m venv "$_vllm_dir"; then
        warn "python3 -m venv failed — install python3-venv (apt) and re-run"
        unset _vllm_dir _mise_bin
        return 1
    fi

    # uv is dramatically faster than pip for the multi-GB vLLM install.
    info "  → installing uv (fast pip frontend) in venv"
    "$_vllm_dir/bin/pip" install --upgrade --quiet pip uv || warn "uv install failed; will fall back to pip"

    info "  → installing vLLM (~5 GB of CUDA wheels; this takes 5-15 min)"
    if [ -x "$_vllm_dir/bin/uv" ]; then
        "$_vllm_dir/bin/uv" pip install --python "$_vllm_dir/bin/python" vllm \
            || { warn "uv pip install vllm failed; trying pip"; "$_vllm_dir/bin/pip" install vllm; }
    else
        "$_vllm_dir/bin/pip" install vllm || { warn "pip install vllm failed"; unset _vllm_dir _mise_bin; return 1; }
    fi

    # Symlink vllm onto $INFERNET_BIN so operators can run it without
    # remembering the venv path. Same for `ray` — vLLM ships with Ray
    # as a transitive dep and uses it internally for tensor/pipeline
    # parallelism, so operators with multi-GPU rigs need ray on PATH
    # to spin up `ray start --head` / `ray start --address=...` for
    # distributed serving.
    if [ -x "$_vllm_dir/bin/vllm" ]; then
        mkdir -p "$INFERNET_BIN"
        ln -sf "$_vllm_dir/bin/vllm" "$INFERNET_BIN/vllm"
        ok "vLLM installed at $_vllm_dir/bin/vllm (linked to $INFERNET_BIN/vllm)"
    else
        warn "vllm binary missing after install — see logs above"
        unset _vllm_dir _mise_bin
        return 1
    fi
    if [ -x "$_vllm_dir/bin/ray" ]; then
        ln -sf "$_vllm_dir/bin/ray" "$INFERNET_BIN/ray"
        ok "Ray CLI linked to $INFERNET_BIN/ray (for distributed vLLM)"
    fi

    # Optional: bring up a Ray cluster head or join an existing one.
    # Operators with one big GPU box leave INFERNET_RAY_MODE unset
    # (vLLM still uses Ray internally for single-node TP). Operators
    # with multi-node clusters set MODE=head on one box and MODE=worker
    # + HEAD=<head>:<port> on the others before running vllm serve.
    case "${INFERNET_RAY_MODE:-}" in
        head)
            _ray_port="${INFERNET_RAY_PORT:-6379}"
            info "  → starting Ray head on :$_ray_port"
            "$_vllm_dir/bin/ray" start --head --port="$_ray_port" \
                --dashboard-host=0.0.0.0 --dashboard-port=8265 \
                || warn "ray start --head failed"
            unset _ray_port
            ;;
        worker)
            if [ -z "${INFERNET_RAY_HEAD:-}" ]; then
                warn "INFERNET_RAY_MODE=worker but INFERNET_RAY_HEAD not set — skip"
            else
                info "  → joining Ray cluster at $INFERNET_RAY_HEAD"
                "$_vllm_dir/bin/ray" start --address="$INFERNET_RAY_HEAD" \
                    || warn "ray start --address=$INFERNET_RAY_HEAD failed"
            fi
            ;;
    esac

    # Auto-start a vllm serve daemon if INFERNET_VLLM_MODEL is set.
    if [ -n "${INFERNET_VLLM_MODEL:-}" ]; then
        info "  → starting 'vllm serve $INFERNET_VLLM_MODEL' in the background"
        _vllm_log="$INFERNET_HOME/vllm.log"
        nohup "$_vllm_dir/bin/vllm" serve "$INFERNET_VLLM_MODEL" \
            --host 0.0.0.0 --port 8000 \
            > "$_vllm_log" 2>&1 &
        printf '%d\n' $! > "$INFERNET_HOME/vllm.pid"
        ok "vllm serve started (pid $!) — logs: $_vllm_log"
        unset _vllm_log
    else
        printf '  to serve a model later: %s/vllm serve <repo/name> --host 0.0.0.0 --port 8000\n' "$INFERNET_BIN"
        printf '  or set INFERNET_VLLM_MODEL=<repo/name> and re-run this installer to auto-start.\n'
    fi

    unset _vllm_dir _mise_bin
}

run_install() {
    info "running pnpm install (downloads ~1.5 GB of node_modules; takes 1-3 min)"
    # Stream pnpm output directly to the terminal so the operator can
    # see download / link progress. Exit code propagates because no pipe.
    if (cd "$SOURCE_DIR" && pnpm install --prefer-offline); then
        ok "dependencies installed"
        return 0
    fi
    fail "pnpm install failed (see output above)"
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
# mise refuses to read untrusted config.toml files. Allowlist the
# config dir (and its canonical form if it's a symlink) so child
# mise invocations don't re-prompt. MISE_YES backstops any trust
# prompt that slips through.
: "\${MISE_YES:=1}"
export MISE_YES
_mise_cfg="\$HOME/.config/mise"
if [ -L "\$_mise_cfg" ]; then
    : "\${MISE_TRUSTED_CONFIG_PATHS:=\$_mise_cfg:\$(readlink -f "\$_mise_cfg" 2>/dev/null)}"
else
    : "\${MISE_TRUSTED_CONFIG_PATHS:=\$_mise_cfg}"
fi
export MISE_TRUSTED_CONFIG_PATHS
unset _mise_cfg
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

    _wired_one=0

    # 1. Symlink at /usr/local/bin/infernet — on PATH for every standard
    # distro and container image. Fails silently if /usr/local/bin is
    # missing or unwritable.
    if [ -d /usr/local/bin ] && [ -w /usr/local/bin ] \
        && ln -sf "$WRAPPER" /usr/local/bin/infernet 2>/dev/null; then
        ok "linked /usr/local/bin/infernet → $WRAPPER"
        _wired_one=1
    elif [ -n "$SUDO" ] && [ -d /usr/local/bin ] \
        && $SUDO ln -sf "$WRAPPER" /usr/local/bin/infernet 2>/dev/null; then
        ok "linked /usr/local/bin/infernet → $WRAPPER (via sudo)"
        _wired_one=1
    fi

    # 2. /etc/profile.d hook — sourced by every login shell system-wide.
    # Doesn't help the current curl | sh session but covers every
    # ssh/exec into the box from now on, regardless of operator's
    # preferred shell.
    if [ -d /etc/profile.d ] && [ -w /etc/profile.d ]; then
        printf 'export PATH="%s:$PATH"\n' "$INFERNET_BIN" \
            > /etc/profile.d/infernet.sh 2>/dev/null \
            && { ok "wrote /etc/profile.d/infernet.sh"; _wired_one=1; }
    elif [ -n "$SUDO" ] && [ -d /etc/profile.d ]; then
        printf 'export PATH="%s:$PATH"\n' "$INFERNET_BIN" \
            | $SUDO tee /etc/profile.d/infernet.sh >/dev/null 2>&1 \
            && { ok "wrote /etc/profile.d/infernet.sh (via sudo)"; _wired_one=1; }
    fi

    # 3. Append to common shell rc files unconditionally (don't trust
    # $SHELL — it's often unset during a curl | sh install). Each
    # file is created if missing.
    for _rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
        if [ -e "$_rc" ] && grep -qF "$INFERNET_BIN" "$_rc" 2>/dev/null; then
            continue   # already present
        fi
        if printf '\n# Added by Infernet Protocol installer\nexport PATH="%s:$PATH"\n' \
            "$INFERNET_BIN" >> "$_rc" 2>/dev/null; then
            ok "appended PATH export to $_rc"
            _wired_one=1
        fi
    done
    unset _rc

    if [ "$_wired_one" = "1" ]; then
        warn "PATH wired for future shells — for THIS session run:"
    else
        warn "$INFERNET_BIN is not on PATH and couldn't be auto-wired — run:"
    fi
    cat <<EOF

      export PATH="$INFERNET_BIN:\$PATH"

  Or invoke by full path: $WRAPPER

EOF
    unset _wired_one
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
        # Only pass --name when operator set INFERNET_NODE_NAME explicitly;
        # otherwise let init generate its own user@host:slug default.
        if [ -n "$INFERNET_NODE_NAME" ]; then
            "$INFERNET_CMD" init --yes \
                --role "$INFERNET_NODE_ROLE" \
                --url "$INFERNET_CONTROL_PLANE" \
                --name "$INFERNET_NODE_NAME" || warn "infernet init had issues"
        else
            "$INFERNET_CMD" init --yes \
                --role "$INFERNET_NODE_ROLE" \
                --url "$INFERNET_CONTROL_PLANE" || warn "infernet init had issues"
        fi
        "$INFERNET_CMD" login --token "$INFERNET_BEARER" || warn "infernet login --token failed"
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

    # Bail early if there isn't enough headroom to finish the install
    # (and pull the model, if INFERNET_BEARER is set so auto-bootstrap
    # will run setup afterwards).
    check_disk_space

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

    # On NVIDIA hosts, also install vLLM so the operator gets the
    # high-throughput engine alongside Ollama. Skipped on AMD / Apple
    # Silicon / CPU. Opt-out: INFERNET_INSTALL_VLLM=0.
    try_install_vllm || warn "vLLM install hit issues — continuing with Ollama only"

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
