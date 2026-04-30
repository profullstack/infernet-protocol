# Monitoring Your Node

## Status Overview

```bash
infernet status
```

```
Node:          node_8f3a2c1d
Status:        online
Uptime:        3d 14h 22m
Backend:       ollama (localhost:11434)
Models loaded: qwen2.5:14b, llama3.2:3b
GPU:           NVIDIA RTX 4090 (24 GB) — 61% utilized
Jobs today:    142 completed, 0 failed, 1 pending
Earnings:      12.84 USDC (unclaimed)
Last heartbeat: 18 seconds ago
```

Run it with `--json` to get machine-readable output:

```bash
infernet status --json | jq '.gpu.utilization'
```

## Logs

### Following Live Logs

```bash
infernet logs
```

Tails the daemon log in real time. Press Ctrl+C to stop.

Example output:

```
[2026-04-30 14:23:32] Heartbeat OK (latency: 39ms)
[2026-04-30 14:23:41] Job job_9a3f2c1d received: qwen2.5:14b, 512 ctx
[2026-04-30 14:23:41] Routing to backend: ollama
[2026-04-30 14:23:42] Streaming started (job_9a3f2c1d)
[2026-04-30 14:23:48] Job job_9a3f2c1d complete: 312 tokens, 52 tok/s
[2026-04-30 14:23:48] CPR issued: cpr_7x2a1b3c
[2026-04-30 14:24:02] Heartbeat OK (latency: 41ms)
```

### Log History

```bash
infernet logs --lines 500
infernet logs --since 1h
infernet logs --since "2026-04-30 12:00"
```

### Log Levels

```bash
infernet logs --level debug
```

Debug logs include: incoming request details, auth header verification, backend probe results, and command queue polling.

### Log Files

Log files are written to `~/.infernet/logs/`:

```
~/.infernet/logs/
  daemon.log          # Main daemon log (current)
  daemon.log.1        # Rotated log
  daemon.log.2
  backend.log         # Inference backend output
  install.log         # Setup and model install log
```

Logs rotate at 50 MB. Up to 5 rotated files are kept.

## Doctor

`infernet doctor` runs a diagnostic suite and reports any issues:

```bash
infernet doctor
```

```
Infernet Node Diagnostics
=========================
[OK] CLI version: 0.9.2 (latest)
[OK] Config file: ~/.infernet/config.json
[OK] Node keypair: present
[OK] Control plane: reachable (42ms)
[OK] Node registered: node_8f3a2c1d
[OK] Node online: yes (last heartbeat 12s ago)
[OK] Backend (ollama): running at localhost:11434
[OK] Models: qwen2.5:14b (loaded), llama3.2:3b (loaded)
[WARN] served_models in config: 2 models
       served_models in backend: 2 models (match)
[OK] Firewall: outbound 443 accessible
[OK] Disk space: 234 GB free
[OK] GPU drivers: NVIDIA 545.29.06
[OK] CUDA: 12.4
[OK] GPU memory: 24 GB (7.2 GB used, 16.8 GB free)

All checks passed (1 warning).
```

Common issues doctor catches:

| Issue | Symptom | Doctor Output |
|-------|---------|---------------|
| Backend not running | Node shows offline | `[FAIL] Backend (ollama): not reachable at localhost:11434` |
| Model mismatch | Jobs fail silently | `[WARN] served_models mismatch: config has X, backend has Y` |
| Clock skew | Auth failures | `[FAIL] System time: 4m 12s drift from NTP (max 30s)` |
| Disk full | Model installs fail | `[FAIL] Disk space: 2 GB free (minimum 20 GB recommended)` |
| Outdated CLI | Missing features | `[WARN] CLI version: 0.8.1 (latest is 0.9.2)` |

Run doctor first whenever your node is behaving unexpectedly.

## Dashboard Monitoring

The Infernet Dashboard shows your node's status in real time via Supabase Realtime:

- **Status dot**: green (online), yellow (degraded), red (offline)
- **Heartbeat**: time since last successful heartbeat
- **Version**: CLI version reported on last heartbeat — useful for knowing when you need to upgrade
- **Models**: which models are currently loaded
- **Job stats**: jobs completed today, this week, all time
- **Earnings**: unclaimed USDC balance
- **GPU metrics**: utilization and memory usage, updated every heartbeat

The **Recent Jobs (Your Nodes Processed)** panel shows the last 20 jobs your node handled, with timestamps, model used, token count, latency, and payment received.

## Heartbeat Intervals

The daemon heartbeats every **30 seconds**. If 3 consecutive heartbeats fail (90 seconds), the control plane marks the node offline. Jobs stop being routed to it immediately.

When the node comes back online and the next heartbeat succeeds, it's marked online again and job routing resumes.

You can check the last heartbeat time from the CLI:

```bash
infernet status | grep "Last heartbeat"
```

Or query it directly:

```bash
curl -s https://infernetprotocol.com/api/v1/nodes/node_8f3a2c1d \
  -H "Authorization: Bearer $INFERNET_BEARER_TOKEN" | jq '.last_heartbeat'
```

## Alerting

For production nodes, consider setting up uptime monitoring on your node's heartbeat. The control plane exposes a public status endpoint:

```
GET https://infernetprotocol.com/api/v1/nodes/{node_id}/status
```

Returns `{"status": "online"}` or `{"status": "offline"}` — easy to wire into any uptime monitoring tool (UptimeRobot, Healthchecks.io, etc.).

You can also configure webhook notifications in the dashboard: **Settings → Notifications** to get a Slack or Discord ping when your node goes offline.
