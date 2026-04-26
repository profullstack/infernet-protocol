/**
 * `infernet tui` — terminal dashboard.
 *
 * React + blessed live monitor for the daemon. Polls the IPC socket
 * every 2s for the daemon's stats snapshot and the local Ollama for
 * loaded-model info, lays it out in four panels: System, Jobs,
 * Engine, Peers.
 *
 * Plain JS (no JSX build step) — uses React.createElement directly so
 * the CLI ships without a transpile.
 *
 * Usage:
 *   infernet tui
 *   infernet tui --refresh 1000     # poll faster (ms)
 *
 * Keys: q / Ctrl-C to quit, r to force a refresh.
 */

import React, { useEffect, useState, useCallback } from "react";
import blessed from "blessed";
import { render } from "react-blessed";

import { isDaemonAlive, sendToDaemon } from "../lib/ipc.js";
import { loadConfig, getConfigPath } from "../lib/config.js";

const e = React.createElement;
const HELP = `infernet tui — terminal dashboard

Usage:
  infernet tui [flags]

Flags:
  --refresh <ms>   Poll interval (default 2000).
  -h, --help       Show this help.

Keys (in TUI):
  q / Ctrl-C       quit
  r                refresh now
`;

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

function fmtUptime(ms) {
    if (typeof ms !== "number") return "?";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function fmtTs(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return iso;
    }
}

async function fetchOllama(host) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return { reachable: false };
        const body = await res.json();
        return { reachable: true, models: body.models ?? [] };
    } catch {
        return { reachable: false };
    }
}

function Panel({ label, top, left, width, height, children, borderColor = "cyan" }) {
    return e(
        "box",
        {
            label: ` ${label} `,
            top,
            left,
            width,
            height,
            border: { type: "line" },
            style: { border: { fg: borderColor }, label: { fg: "white", bold: true } }
        },
        children
    );
}

function KV({ k, v, top }) {
    return e(
        "box",
        { top, left: 1, height: 1, content: `{bold}${k}{/bold} ${v ?? "—"}`, tags: true }
    );
}

function App({ refreshMs }) {
    const [config, setConfig] = useState(null);
    const [snap, setSnap] = useState(null);
    const [daemon, setDaemon] = useState({ alive: false });
    const [ollama, setOllama] = useState({ reachable: false, models: [] });
    const [tick, setTick] = useState(0);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const cfg = await loadConfig();
            setConfig(cfg);
            const alive = await isDaemonAlive(500);
            setDaemon({ alive });
            if (alive) {
                const r = await sendToDaemon("stats", null, { timeoutMs: 1500 });
                if (r?.ok) setSnap(r.data);
                else setError(r?.error ?? "stats failed");
            } else {
                setSnap(null);
            }
            const ollamaHost = cfg?.engine?.ollamaHost ?? process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
            setOllama(await fetchOllama(ollamaHost));
            setError(null);
        } catch (err) {
            setError(err?.message ?? String(err));
        }
        setTick((t) => t + 1);
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, refreshMs);
        return () => clearInterval(id);
    }, [refresh, refreshMs]);

    const stats = snap?.stats ?? {};
    const nodeName = config?.node?.name ?? config?.node?.nodeId ?? "(no node configured)";
    const role = config?.node?.role ?? "—";
    const cpUrl = config?.controlPlane?.url ?? "(not set)";
    const engineCfg = config?.engine ?? {};

    const headerText =
        `{bold}Infernet TUI{/bold}  ${nodeName}  [${role}]  ` +
        `${daemon.alive ? "{green-fg}● daemon up{/}" : "{red-fg}○ daemon down{/}"}  ` +
        `${ollama.reachable ? "{green-fg}● ollama up{/}" : "{red-fg}○ ollama down{/}"}  ` +
        `tick=${tick}`;

    return e(
        "element",
        {},
        e(
            "box",
            {
                top: 0, left: 0, width: "100%", height: 1,
                content: headerText, tags: true,
                style: { fg: "white", bg: "blue" }
            }
        ),

        e(
            Panel,
            { label: "System", top: 1, left: 0, width: "50%", height: "45%-1", borderColor: "cyan" },
            e(KV, { top: 1, k: "daemon:", v: daemon.alive ? "running" : "offline" }),
            e(KV, { top: 2, k: "uptime:", v: snap ? fmtUptime(snap.uptimeMs) : "—" }),
            e(KV, { top: 3, k: "pid:   ", v: snap?.pid ?? "—" }),
            e(KV, { top: 4, k: "node:  ", v: nodeName }),
            e(KV, { top: 5, k: "role:  ", v: role }),
            e(KV, { top: 6, k: "ctrl:  ", v: cpUrl }),
            e(KV, { top: 7, k: "p2p:   ", v: snap?.p2p?.enabled ? snap.p2p.endpoint : "disabled" }),
            e(KV, { top: 8, k: "config:", v: getConfigPath() })
        ),

        e(
            Panel,
            { label: "Jobs", top: 1, left: "50%", width: "50%", height: "45%-1", borderColor: "magenta" },
            e(KV, { top: 1, k: "picked:    ", v: stats.jobsPicked ?? 0 }),
            e(KV, { top: 2, k: "completed: ", v: stats.jobsCompleted ?? 0 }),
            e(KV, { top: 3, k: "failed:    ", v: stats.jobsFailed ?? 0 }),
            e(KV, { top: 4, k: "active:    ", v: stats.activeJobs ?? 0 }),
            e(KV, { top: 5, k: "last job:  ", v: fmtTs(stats.lastJobAt) }),
            e(KV, { top: 6, k: "polls ok:  ", v: `${stats.pollsOk ?? 0} / ${(stats.pollsOk ?? 0) + (stats.pollsFailed ?? 0)}` }),
            e(KV, { top: 7, k: "last poll: ", v: fmtTs(stats.lastPollAt) }),
            e(KV, { top: 8, k: "heartbeats:", v: `${stats.heartbeatsOk ?? 0} ok / ${stats.heartbeatsFailed ?? 0} fail` })
        ),

        e(
            Panel,
            { label: "Engine", top: "45%", left: 0, width: "50%", height: "50%-1", borderColor: "yellow" },
            e(KV, { top: 1, k: "backend:", v: engineCfg.backend ?? "auto" }),
            e(KV, { top: 2, k: "model:  ", v: engineCfg.model ?? "(unset)" }),
            e(KV, { top: 3, k: "ollama: ", v: ollama.reachable ? `up (${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"})` : "down" }),
            e(
                "box",
                {
                    top: 5, left: 1, width: "100%-2", height: "100%-7",
                    content: ollama.reachable
                        ? (ollama.models.length === 0
                            ? "(no models pulled — try: infernet model pull qwen2.5:7b)"
                            : ollama.models.slice(0, 8).map((m) => {
                                const size =
                                    typeof m.size === "number"
                                        ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB`
                                        : "?";
                                const active = m.name === engineCfg.model ? " *" : "";
                                return `  ${m.name.padEnd(20)} ${size}${active}`;
                            }).join("\n"))
                        : "ollama not reachable — run `infernet setup`",
                    tags: false
                }
            )
        ),

        e(
            Panel,
            { label: "Peers (IPIP-0002, not yet implemented)", top: "45%", left: "50%", width: "50%", height: "50%-1", borderColor: "white" },
            e(
                "box",
                {
                    top: 1, left: 1, width: "100%-2", height: "100%-2",
                    content:
                        "Operator-to-operator chat is specified in IPIP-0002.\n\n" +
                        "Once implemented, this panel will show:\n" +
                        "  • Default rooms: #general #support #news #offtopic\n" +
                        "  • Unread DM count\n" +
                        "  • Connected relays\n\n" +
                        "Spec: ipips/ipip-0002.md"
                }
            )
        ),

        e(
            "box",
            {
                bottom: 0, left: 0, width: "100%", height: 1,
                content: error
                    ? `{red-bg}{white-fg} ${error} {/}   q: quit   r: refresh`
                    : `q: quit   r: refresh   refresh=${refreshMs}ms`,
                tags: true,
                style: { fg: "white", bg: "black" }
            }
        )
    );
}

export default async function tui(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }
    if (!process.stdout.isTTY) {
        process.stderr.write("error: infernet tui requires a TTY\n");
        return 2;
    }

    const refreshMs = Number.parseInt(args.get("refresh") ?? "", 10) || 2000;

    const screen = blessed.screen({
        smartCSR: true,
        title: "Infernet TUI",
        fullUnicode: true
    });

    screen.key(["q", "C-c"], () => {
        screen.destroy();
        process.exit(0);
    });

    let triggerRefresh = null;
    screen.key(["r"], () => {
        if (triggerRefresh) triggerRefresh();
    });

    // Wrap App so we can grab its `refresh` callback for the `r` keybind.
    function Root() {
        const [, force] = useState(0);
        triggerRefresh = () => force((n) => n + 1);
        return e(App, { refreshMs });
    }

    render(e(Root), screen);

    // Block until quit. The exit handler in screen.key("q") calls
    // process.exit(0), so this promise never resolves intentionally.
    return new Promise(() => {});
}
