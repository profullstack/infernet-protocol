# Monitoring Your Node

## Status Overview

```bash
infernet status
```

```
Node:          provider-a1b2c3d4
Status:        online
Uptime:        3d 14h 22m
Backend:       ollama (localhost:11434)
Models loaded: qwen2.5:14b
GPU:           NVIDIA RTX 4090 (24 GB)
Last heartbeat: 18 seconds ago
```

## Logs

### Live Log Stream

```bash
infernet logs -f
```

Streams new log lines as the daemon writes them. Press Ctrl+C to stop.

Example output:

```
[2026-04-30 14:23:32] Heartbeat OK (latency: 39ms)
[2026-04-30 14:23:41] Job job_9a3f2c1d received: qwen2.5:14b, 512 ctx
[2026-04-30 14:23:42] Streaming started (job_9a3f2c1d)
[2026-04-30 14:23:48] Job job_9a3f2c1d complete: 312 tokens, 52 tok/s
[2026-04-30 14:24:02] Heartbeat OK (latency: 41ms)
```

### Last N Lines

```bash
infernet logs --lines 500
```

Default is 200 lines. Omit `--lines` for the default.

### Log File Location

Logs are written to `/var/log/infernet/daemon.log` on systems where that directory is writable (i.e., when running as root or with sudo). On non-root installs, the log falls back to `~/.config/infernet/daemon.log`.

Logrotate is configured by `infernet setup` on Linux: daily rotation, 14-day retention, `copytruncate` (daemon doesn't need a restart for rotation to take effect).

```
/var/log/infernet/daemon.log
/var/log/infernet/daemon.log.1   # yesterday
/var/log/infernet/daemon.log.2   # ...
```

## Doctor

`infernet doctor` runs a diagnostic suite and reports any issues:

```bash
infernet doctor
```

```
Infernet Node Diagnostics
=========================
[OK] CLI version: v0.1.19 (latest)
[OK] Config file: ~/.config/infernet/config.json
[OK] Node keypair: present
[OK] Control plane: reachable (42ms)
[OK] Node registered: provider-a1b2c3d4
[OK] Node online: yes (last heartbeat 12s ago)
[OK] Backend (ollama): running at localhost:11434
[OK] Models: qwen2.5:14b (loaded)
[OK] Firewall: outbound 443 accessible
[OK] Disk space: 234 GB free
[OK] GPU drivers: NVIDIA 545.29.06
[OK] CUDA: 12.4
[OK] GPU memory: 24 GB (7.2 GB used, 16.8 GB free)

All checks passed.
```

Common issues doctor catches:

| Issue | Doctor Output |
|-------|--------------|
| Backend not running | `[FAIL] Backend (ollama): not reachable at localhost:11434` |
| Model mismatch | `[WARN] served_models mismatch: config has X, backend has Y` |
| Clock skew | `[FAIL] System time: 4m 12s drift from NTP (max 30s)` |
| Disk full | `[FAIL] Disk space: 2 GB free (minimum 20 GB recommended)` |
| Outdated CLI | `[WARN] CLI version: v0.1.10 (latest is v0.1.19)` |

Run doctor first whenever your node is behaving unexpectedly.

## Dashboard Monitoring

The [Infernet Dashboard](https://infernetprotocol.com/dashboard) shows your node's status in real time:

- **Status dot**: green (online), yellow (degraded), red (offline)
- **Heartbeat**: time since last successful heartbeat
- **Version**: CLI version reported on last registration — lets you spot nodes that haven't auto-upgraded yet
- **Models**: which models are currently advertised by the node
- **Recent Jobs (Your Nodes Processed)**: last 20 jobs with timestamps, model, token count, latency, and payment

## Heartbeat Intervals

The daemon heartbeats every **30 seconds**. If 3 consecutive heartbeats fail (90 seconds), the control plane marks the node offline and stops routing jobs to it. When connectivity is restored and the next heartbeat succeeds, job routing resumes automatically.

## Alerting

The control plane exposes a public status endpoint you can wire into any uptime monitoring tool:

```
GET https://infernetprotocol.com/api/v1/nodes/{node_id}/status
```

Returns `{"status": "online"}` or `{"status": "offline"}`. Works with UptimeRobot, Healthchecks.io, etc.

Dashboard webhook notifications can be configured at **Settings → Notifications** for Slack or Discord alerts when your node goes offline.
