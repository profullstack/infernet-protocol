"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Realtime-driven page refresher. Replaces the timer-based <AutoRefresh>:
 * subscribes to /api/realtime/changes for the named tables and calls
 * router.refresh() on every change (debounced ~500ms so a burst of
 * row events collapses to one re-render).
 *
 * Falls back to a slow timer (default 60s) when the SSE channel is
 * unavailable, so the page still self-heals even if Realtime is down.
 *
 * Pauses while the tab is hidden — no point burning server cycles for
 * nobody.
 *
 *   <RealtimeRefresh tables={["providers", "jobs"]} />
 */
export default function RealtimeRefresh({
    tables,
    fallbackIntervalMs = 60_000,
    label = "Live"
}) {
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState(() => Date.now());
    const [tickRender, setTickRender] = useState(0);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let debounce = null;
        let fallbackTimer = null;
        let ticker = null;
        let es = null;

        const doRefresh = () => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            router.refresh();
            setLastRefresh(Date.now());
        };

        const scheduleRefresh = () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(doRefresh, 500);
        };

        const onVisible = () => {
            if (document.visibilityState === "visible") doRefresh();
        };

        ticker = setInterval(() => setTickRender((n) => n + 1), 1000);
        document.addEventListener("visibilitychange", onVisible);

        try {
            const url = `/api/realtime/changes?tables=${encodeURIComponent(tables.join(","))}`;
            es = new EventSource(url);
            es.addEventListener("ready", () => setConnected(true));
            es.addEventListener("change", scheduleRefresh);
            es.onerror = () => setConnected(false);
        } catch {
            setConnected(false);
        }

        // Always run a slow fallback timer — covers the case where the
        // SSE channel never connects, or silently dies behind a proxy.
        fallbackTimer = setInterval(doRefresh, fallbackIntervalMs);

        return () => {
            if (debounce) clearTimeout(debounce);
            clearInterval(ticker);
            clearInterval(fallbackTimer);
            document.removeEventListener("visibilitychange", onVisible);
            try { es?.close(); } catch { /* ignore */ }
        };
    }, [router, fallbackIntervalMs, tables.join(",")]);

    const sinceMs = Date.now() - lastRefresh;
    const sinceLabel = sinceMs < 1000 ? "now" : `${Math.floor(sinceMs / 1000)}s ago`;
    const tone = connected
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
        : "border-amber-400/30 bg-amber-400/10 text-amber-100";
    const dotColor = connected ? "bg-emerald-400" : "bg-amber-400";

    return (
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${tone}`}>
            <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
            </span>
            <span>
                {label} · {sinceLabel}
                <span className="hidden">{tickRender}</span>
            </span>
        </span>
    );
}
