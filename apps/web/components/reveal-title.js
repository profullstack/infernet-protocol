"use client";
import { useState } from "react";

export default function RevealTitle({ prompt }) {
    const [revealed, setRevealed] = useState(false);

    if (revealed) {
        const text = prompt ?? "(E2E encrypted — prompt not available)";
        return (
            <span className="font-mono text-xs text-white/80 break-all max-w-[32ch] line-clamp-2" title={text}>
                {text}
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
