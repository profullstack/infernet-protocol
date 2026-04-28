"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop this into a server-rendered page to make it auto-refresh.
 *
 * Calls router.refresh() every `intervalMs`, which re-fetches every
 * server component on the current page and re-renders in place — no
 * full page reload, no scroll jump, no client state lost. Pauses
 * while the tab is hidden so we don't burn server cycles for nobody.
 *
 * Renders a small live indicator (pulsing dot + "live · Xs ago"):
 *   <AutoRefresh intervalMs={10000} label="Live" />
 *
 * intervalMs defaults to 10s. Don't go below 3s without a good
 * reason — every refresh is a full server-component re-render.
 */
export default function AutoRefresh({ intervalMs = 10000, label = "Live" }) {
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState(() => Date.now());
    const [tickRender, setTickRender] = useState(0);

    useEffect(() => {
        let timer = null;
        let ticker = null;

        const tick = () => {
            // Skip refresh while the tab is hidden — no point burning
            // server cycles when nobody's looking.
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            router.refresh();
            setLastRefresh(Date.now());
        };

        timer = setInterval(tick, intervalMs);
        // Repaint the "Xs ago" label every second without re-running tick.
        ticker = setInterval(() => setTickRender((n) => n + 1), 1000);

        const onVisible = () => {
            if (document.visibilityState === "visible") tick();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            clearInterval(timer);
            clearInterval(ticker);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [intervalMs, router]);

    const sinceMs = Date.now() - lastRefresh;
    const sinceLabel = sinceMs < 1000 ? "now" : `${Math.floor(sinceMs / 1000)}s ago`;

    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
            <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>
                {label} · {sinceLabel}
                {/* tickRender is read so React keeps repainting the label */}
                <span className="hidden">{tickRender}</span>
            </span>
        </span>
    );
}
