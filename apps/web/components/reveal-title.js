"use client";
import { useState } from "react";

export default function RevealTitle({ title }) {
    const [revealed, setRevealed] = useState(false);
    if (revealed) {
        return (
            <span className="font-mono text-xs text-white/80 truncate max-w-[24ch]" title={title}>
                {title}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={() => setRevealed(true)}
            className="font-mono text-xs text-[var(--muted)] hover:text-white transition"
            title="Click to reveal job title"
        >
            &lt;encrypted&gt;
        </button>
    );
}
