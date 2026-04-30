"use client";
import { useState } from "react";

export default function RevealTitle({ prompt }) {
    const [revealed, setRevealed] = useState(false);

    if (revealed) {
        const preview = prompt ? prompt.split(/\s+/).slice(0, 6).join(" ") + (prompt.split(/\s+/).length > 6 ? "…" : "") : "(E2E encrypted)";
        return (
            <span className="text-xs text-white/80" title={prompt ?? ""}>
                {preview}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={() => setRevealed(true)}
            className="font-mono text-xs text-[var(--muted)] hover:text-white transition"
            title="Click to reveal prompt"
        >
            &lt;encrypted&gt;
        </button>
    );
}
