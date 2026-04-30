"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-node model management button on the dashboard.
 *
 * Shows two sections:
 *   Install — text input + presets → model_install command
 *   Installed — list of currently served models → model_remove command
 *
 * Commands are queued via POST /api/v1/user/nodes/<pubkey>/commands and
 * picked up by the daemon's poll loop within ~30s.
 */
const PRESETS = [
    "qwen2.5:0.5b",
    "qwen2.5:3b",
    "qwen2.5:7b",
    "qwen2.5:14b",
    "qwen2.5:32b",
    "llama3.1:8b",
    "mistral:7b"
];

export default function PushModelButton({ pubkey, servedModels = [] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [model, setModel] = useState("qwen2.5:7b");
    const [submitting, setSubmitting] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [error, setError] = useState(null);
    const [commands, setCommands] = useState([]);
    const [loadingCommands, setLoadingCommands] = useState(false);

    async function refresh() {
        if (!open) return;
        setLoadingCommands(true);
        try {
            const res = await fetch(`/api/v1/user/nodes/${encodeURIComponent(pubkey)}/commands?limit=10`);
            if (res.ok) {
                const body = await res.json();
                setCommands(body?.data ?? []);
            }
        } catch { /* ignore */ }
        setLoadingCommands(false);
    }

    useEffect(() => {
        if (!open) return;
        refresh();
        const inFlight = (cs) => cs.some((c) => c.status === "pending" || c.status === "running");
        const tick = () => { if (inFlight(commands)) refresh(); };
        const id = setInterval(tick, 5000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, commands.length]);

    async function submit(e) {
        e?.preventDefault?.();
        setError(null);
        setSubmitting(true);
        try {
            const res = await fetch(`/api/v1/user/nodes/${encodeURIComponent(pubkey)}/commands`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: "model_install", args: { model } })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
            setCommands((prev) => [body.data, ...prev]);
            router.refresh();
        } catch (err) {
            setError(err?.message ?? String(err));
        } finally {
            setSubmitting(false);
        }
    }

    async function removeModel(name) {
        setError(null);
        setRemoving(name);
        try {
            const res = await fetch(`/api/v1/user/nodes/${encodeURIComponent(pubkey)}/commands`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: "model_remove", args: { model: name } })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
            setCommands((prev) => [body.data, ...prev]);
            router.refresh();
        } catch (err) {
            setError(err?.message ?? String(err));
        } finally {
            setRemoving(null);
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md border border-white/15 bg-[var(--panel-strong)] px-2.5 py-1 text-xs text-white hover:bg-white/10"
            >
                Models
            </button>
        );
    }

    return (
        <div className="absolute right-0 top-0 z-20 w-[min(24rem,90vw)] rounded-[1rem] border border-white/15 bg-[var(--panel)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Manage models</h3>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="rounded p-1 text-[var(--muted)] hover:text-white"
                >
                    ✕
                </button>
            </div>

            {/* Install section */}
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Install</p>
            <form onSubmit={submit} className="mt-1.5 space-y-3">
                <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="qwen2.5:7b"
                    className="block w-full rounded-md border border-white/10 bg-[var(--panel-strong)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
                />
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setModel(p)}
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                                model === p
                                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                                    : "border-white/10 bg-[var(--panel-strong)] text-[var(--muted)] hover:text-white"
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                <button
                    type="submit"
                    disabled={submitting || !model.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)] disabled:opacity-40"
                >
                    {submitting ? "Queueing…" : "Push install"}
                </button>
            </form>

            {/* Installed models section */}
            {servedModels.length > 0 && (
                <div className="mt-4 border-t border-white/10 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Installed on node</p>
                    <ul className="mt-2 space-y-1.5">
                        {servedModels.map((name) => (
                            <li key={name} className="flex items-center justify-between gap-3">
                                <span className="truncate text-xs text-white">{name}</span>
                                <button
                                    type="button"
                                    disabled={removing === name}
                                    onClick={() => removeModel(name)}
                                    className="shrink-0 rounded border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-400/20 disabled:opacity-40"
                                >
                                    {removing === name ? "…" : "remove"}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {error ? (
                <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-200">
                    {error}
                </p>
            ) : null}

            {/* Recent commands */}
            <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Recent commands {loadingCommands ? "(refreshing…)" : ""}
                </p>
                {commands.length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                        Nothing queued yet. Daemon polls every ~30s.
                    </p>
                ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                        {commands.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-3">
                                <span className="truncate text-white">
                                    {c.command === "model_install" ? "+" : c.command === "model_remove" ? "−" : "?"}{" "}
                                    {c.args?.model ?? "—"}
                                </span>
                                <CommandStatus s={c.status} />
                            </li>
                        ))}
                    </ul>
                )}
                {commands.some((c) => c.error) ? (
                    <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
                        {commands.find((c) => c.error)?.error}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function CommandStatus({ s }) {
    const tone =
        s === "completed" ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30" :
        s === "failed"    ? "bg-red-400/15 text-red-200 border-red-400/30" :
        s === "running"   ? "bg-amber-400/15 text-amber-100 border-amber-400/30" :
                            "bg-white/5 text-[var(--muted)] border-white/10";
    return (
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
            {s ?? "?"}
        </span>
    );
}
