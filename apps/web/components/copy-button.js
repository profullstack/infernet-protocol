"use client";

import { useState } from "react";

/**
 * Click-to-copy button. Drops onto any <pre>/<code> block:
 *
 *   <div className="relative">
 *     <CopyButton text="curl ... | bash" />
 *     <pre>...</pre>
 *   </div>
 *
 * Renders absolute-positioned in the top-right of its relative parent
 * by default (className="absolute right-2 top-2"). Pass `className`
 * to override placement.
 *
 * Falls back gracefully where navigator.clipboard isn't available
 * (insecure-context iframes, very old browsers) — the button still
 * renders but shows "copy failed" briefly instead of "copied".
 */
export default function CopyButton({ text, label = "copy", className = "" }) {
    const [state, setState] = useState("idle"); // idle | copied | failed

    async function copy() {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Pre-2017-ish fallback. Doesn't work everywhere.
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.position = "absolute";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            setState("copied");
        } catch {
            setState("failed");
        }
        setTimeout(() => setState("idle"), 1500);
    }

    const color =
        state === "copied" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" :
        state === "failed" ? "border-red-400/40 bg-red-400/10 text-red-200" :
        "border-white/15 bg-[var(--panel-strong)] text-[var(--muted)] hover:text-white";

    const text_ =
        state === "copied" ? "copied!" :
        state === "failed" ? "copy failed" :
        label;

    const placement = className || "absolute right-2 top-2";

    return (
        <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label}`}
            className={`${placement} z-10 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition ${color}`}
        >
            <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                {state === "copied" ? (
                    <polyline points="20 6 9 17 4 12" />
                ) : (
                    <>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </>
                )}
            </svg>
            {text_}
        </button>
    );
}
