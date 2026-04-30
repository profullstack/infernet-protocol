# Installation

## Install the CLI

```bash
curl -sSL https://infernetprotocol.com/install | bash
```

The installer:
1. Detects your OS and architecture
2. Downloads the appropriate pre-built Node.js binary
3. Installs it to `/usr/local/bin/infernet` (or `~/.local/bin` if not root)
4. Adds it to your PATH

After the install, either open a new shell or `source ~/.bashrc` / `source ~/.zshrc`.

Verify:

```bash
infernet --version
# infernet v0.1.19
#   up to date
```

### Manual Install

```bash
INFERNET_VERSION=$(curl -s https://infernetprotocol.com/version)
curl -sSL "https://github.com/profullstack/infernet-protocol/releases/download/${INFERNET_VERSION}/infernet-linux-x86_64" \
  -o /usr/local/bin/infernet
chmod +x /usr/local/bin/infernet
```

Available platforms: `linux-x86_64`, `linux-aarch64`, `darwin-arm64`, `darwin-x86_64`.

---

## Run Setup

```bash
infernet setup
```

`setup` is interactive and walks through every step. Pass `--yes` to accept defaults non-interactively:

```bash
infernet setup --yes
```

### What Setup Does

**1. Collect registration token**

You'll be prompted for the one-time registration token from the dashboard. Get it at **Nodes → Add Node** in the [Infernet Dashboard](https://infernetprotocol.com).

**2. Detect hardware**

The wizard runs `nvidia-smi`, `rocminfo`, and system checks to determine GPU model, VRAM, system RAM, and CPU cores. Only coarse capability data is sent to the control plane — no hostname or exact CPU model leaves the node.

**3. Install inference backend**

If no backend is detected, Ollama is installed automatically. If you want a different backend (vLLM, SGLang, MAX), install it first (see [Chapter 3](../03-inference-backends/index.md)), then run setup — it will detect and configure it.

**4. Pull default model**

The wizard suggests a model based on your VRAM tier:

| Tier | Default Model |
|------|--------------|
| >=48gb | qwen2.5:72b |
| 24-48gb | qwen2.5:14b |
| 16-24gb | qwen2.5:7b |
| 8-16gb | qwen2.5:7b |
| cpu | qwen2.5:1.5b |

**5. Generate keypair + config**

A secp256k1 keypair (Nostr-compatible) is generated. Config is written to `~/.config/infernet/config.json` with mode `0600`:

```json
{
  "controlPlane": { "url": "https://infernetprotocol.com" },
  "node": {
    "id": null,
    "nodeId": "provider-a1b2c3d4",
    "role": "provider",
    "name": "user@hostname",
    "publicKey": "abcdef...",
    "privateKey": "012345...",
    "address": "1.2.3.4",
    "port": 46337
  },
  "engine": {
    "backend": "ollama",
    "ollamaHost": "http://localhost:11434",
    "model": "qwen2.5:7b"
  }
}
```

**6. Configure logrotate**

On Linux, setup writes `/etc/logrotate.d/infernet` so logs in `/var/log/infernet/` rotate daily and are retained for 14 days.

**7. Register with the control plane**

`infernet register` is called automatically. The node's public key, role, GPU capabilities, and available models are sent to the control plane.

---

## Firewall Configuration

The daemon makes outbound HTTPS connections only — no inbound ports are required for basic operation. If clients connect directly to your node:

```bash
# UFW
sudo ufw allow out 443/tcp
sudo ufw allow in 46337/tcp   # P2P port (default)

# iptables
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT  -p tcp --dport 46337 -j ACCEPT
```

---

## Running as a System Service

```bash
infernet service install
```

This creates a systemd unit (Linux) or launchd plist (macOS) so the daemon starts at boot.

```bash
infernet service start
infernet service stop
infernet service restart
infernet service status
infernet service uninstall
```

---

## Auto-Upgrade

The daemon checks for a new CLI version every 5 minutes against the GitHub releases API. When a newer version is available it:

1. Re-runs the installer to pull the new binary
2. Waits for in-flight jobs to finish
3. Closes all server sockets
4. Re-execs itself into the new binary

No manual intervention needed. You can also trigger an upgrade manually:

```bash
infernet upgrade
```

Check your current version at any time:

```bash
infernet --version
```

---

## Upgrading the CLI Manually

```bash
infernet upgrade
```

Re-runs the curl installer. Config, keys, and registered node identity are preserved.

---

## Uninstalling

```bash
infernet remove
```

Stops the daemon, removes the service unit, removes the binary, and optionally removes your config and keys (it will ask). The node's registration on the control plane is deactivated.
