# Installation

## Install the CLI

```bash
curl -sSL https://infernetprotocol.com/install | bash
```

The installer:
1. Detects your OS and architecture
2. Downloads the appropriate binary
3. Installs it to `~/.local/bin` (or `/usr/local/bin` with sudo)
4. Adds it to your PATH in `~/.bashrc` / `~/.zshrc`

After the install, either open a new shell or run:

```bash
source ~/.bashrc
# or
source ~/.zshrc
```

Verify:

```bash
infernet --version
```

### Manual Install

If you prefer not to pipe to bash:

```bash
# Check latest version
INFERNET_VERSION=$(curl -s https://infernetprotocol.com/version)

# Download binary for your platform
curl -sSL "https://github.com/infernetprotocol/infernet/releases/download/${INFERNET_VERSION}/infernet-linux-x86_64" \
  -o /usr/local/bin/infernet

chmod +x /usr/local/bin/infernet
```

Available platforms: `linux-x86_64`, `linux-aarch64`, `darwin-arm64`, `darwin-x86_64`.

---

## Run Setup

```bash
infernet setup
```

### What Setup Does

**1. Collect registration token**

You'll be prompted for the one-time registration token from the dashboard. Get it at **Nodes → Add Node** in the [Infernet Dashboard](https://infernetprotocol.com).

**2. Detect hardware**

The wizard runs `nvidia-smi`, `rocminfo`, and system checks to determine:
- GPU model and VRAM
- VRAM tier assignment
- System RAM
- Number of CPU cores

**3. Install inference backend**

If no backend is detected, Ollama is installed automatically. If you want a different backend, install it first (see [Chapter 3](../03-inference-backends/index.md)), then run setup — it will detect the backend and use it.

**4. Pull default model**

The wizard suggests a default model based on your tier:

| Tier | Default Model |
|------|--------------|
| >=48gb | qwen2.5:72b |
| >=24gb | qwen2.5:14b |
| >=12gb | qwen2.5:7b |
| >=8gb | qwen2.5:7b |
| cpu | qwen2.5:1.5b |

You can accept the default or enter a different model name. The wizard pulls the model before proceeding.

**5. Generate keypair**

A secp256k1 keypair is generated for this node. The private key is written to `~/.infernet/keys/node.key` with permissions `600`. The public key is registered with the control plane.

**6. Write config**

Config is written to `~/.infernet/config.json`:

```json
{
  "node_id": "node_8f3a2c1d",
  "public_key": "npub1abc123...",
  "control_plane_url": "https://infernetprotocol.com",
  "backend": "ollama",
  "ollama_host": "http://localhost:11434",
  "served_models": ["qwen2.5:14b"],
  "vram_tier": ">=24gb",
  "payout_address": ""
}
```

You can edit this file directly. Changes take effect on next daemon restart.

---

## Firewall Configuration

The node daemon listens on port `3000` by default. The inference backend (e.g., Ollama) listens on its own port (`11434` for Ollama). Neither needs to be externally accessible — the daemon makes outbound connections to the control plane only.

However, if you're running behind a NAT or firewall, make sure outbound HTTPS (port 443) is permitted:

```bash
# UFW (Ubuntu)
sudo ufw allow out 443/tcp
sudo ufw allow out 80/tcp

# Check current status
sudo ufw status
```

If clients connect directly to your node (direct-routing mode), you also need inbound on port 3000:

```bash
sudo ufw allow in 3000/tcp
```

For datacenter deployments with `iptables`:

```bash
# Allow outbound HTTPS
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# Allow inbound on node port (if using direct routing)
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

---

## Running as a System Service

For production nodes, you want the daemon to start automatically on boot and restart if it crashes.

```bash
infernet service install
```

This creates a systemd service unit at `/etc/systemd/system/infernet.service` (Linux) or a launchd plist at `~/Library/LaunchAgents/sh.infernet.daemon.plist` (macOS).

### Managing the Service

```bash
# Start
infernet service start

# Stop
infernet service stop

# Restart
infernet service restart

# Check status
infernet service status

# View logs (follows systemd journal)
infernet service logs

# Remove from boot (does not uninstall)
infernet service uninstall
```

### Manual Systemd Unit

If you prefer to write your own unit file:

```ini
[Unit]
Description=Infernet Protocol Node Daemon
After=network.target
Wants=network.target

[Service]
Type=simple
User=infernet
ExecStart=/usr/local/bin/infernet start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=HOME=/home/infernet

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable infernet
sudo systemctl start infernet
```

It's good practice to run the daemon as a dedicated non-root user. Create one with:

```bash
sudo useradd -r -s /bin/false -d /home/infernet infernet
sudo mkdir -p /home/infernet/.infernet
sudo chown -R infernet:infernet /home/infernet
```

Then move your config:

```bash
sudo cp -r ~/.infernet/* /home/infernet/.infernet/
sudo chown -R infernet:infernet /home/infernet/.infernet
```

---

## Upgrading the CLI

```bash
infernet upgrade
```

This re-runs the curl installer to fetch the latest version. Your config and keys are preserved.

---

## Uninstalling

```bash
infernet remove
```

This stops the daemon, removes the service unit, removes the binary, and optionally removes your config and keys (it will ask). The node's registration on the control plane is deactivated.
