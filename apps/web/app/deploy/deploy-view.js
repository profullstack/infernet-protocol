"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/copy-button";
import ProviderLogos from "@/components/provider-logos";

/**
 * One-click deploy UI — universal cloud-init + provider deep links.
 *
 * Flow:
 *   1. If signed in, "Mint deploy token" calls /api/v1/user/deploy/provision
 *      to get a 24h bearer + a customized cloud-init URL.
 *   2. Show a one-liner the user can paste anywhere (their own server,
 *      a DigitalOcean droplet's user_data, a RunPod custom-image pod, etc.)
 *   3. Provider-specific cards link to RunPod / DigitalOcean's "deploy"
 *      flows with the cloud-init URL pre-filled where possible.
 *
 * No API keys are pasted into this page. The cloud-init script does
 * everything inside the rented box; we just hand it a token that lets
 * the new node attach itself to the user's account.
 */
export default function DeployView({ signedInAs = null }) {
    const [token, setToken] = useState(null);
    const [cloudInitUrl, setCloudInitUrl] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [error, setError] = useState(null);
    const [signedIn, setSignedIn] = useState(null);
    const [origin, setOrigin] = useState("https://infernetprotocol.com");

    useEffect(() => {
        if (typeof window !== "undefined") setOrigin(window.location.origin);
    }, []);

    async function mint() {
        setError(null);
        try {
            const res = await fetch("/api/v1/user/deploy/provision", { method: "POST" });
            if (res.status === 401) {
                setSignedIn(false);
                throw new Error("Sign in first to mint a deploy token.");
            }
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
            setToken(body.data.token);
            setCloudInitUrl(`${origin}${body.data.cloud_init_url}`);
            setExpiresAt(body.data.expires_at);
            setSignedIn(true);
        } catch (e) {
            setError(e?.message ?? String(e));
        }
    }

    const fullUrl = cloudInitUrl ?? `${origin}/api/deploy/cloud-init`;
    const oneLiner = `curl -fsSL '${fullUrl}' | sh`;

    // DigitalOcean API: create a droplet directly via REST. user_data
    // gets the same one-liner the manual UI flow uses, JSON-encoded so
    // shell-quote escaping survives. Operator replaces $DO_TOKEN with
    // their personal access token, edits region/size/ssh_keys.
    const doApiCmd = `curl -X POST https://api.digitalocean.com/v2/droplets \\
  -H "Authorization: Bearer $DO_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
        name: "infernet",
        region: "sfo3",
        size: "gpu-h100x1-80gb",
        image: "gpu-h100x1-base",
        ssh_keys: [],
        backups: false,
        ipv6: true,
        monitoring: true,
        tags: ["infernet"],
        user_data: oneLiner,
        vpc_uuid: ""
    }, null, 2)}'`;

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-10">
            <header className="mb-8 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
                    Rent a GPU, run a node
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Spin up a provider on RunPod or DigitalOcean.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
                    Universal bootstrap: one cloud-init script that works on any Linux box.
                    Pulls the CLI, installs Ollama, picks a model, registers, and starts heartbeating —
                    all in one boot. No SSH afterwards.
                </p>
                {signedInAs ? (
                    <p className="text-xs text-[var(--muted)]">
                        Signed in as <span className="font-mono text-white">{signedInAs}</span>.
                        Tokens minted here are bound to this account and expire in 24h.
                    </p>
                ) : null}
            </header>

            {/* Token mint */}
            <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-white">1. Mint a deploy token</h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                            24h-scoped bearer. The new node uses it to auto-link itself to your account.
                            Skip this step if you want the node to be unlinked (you can claim its pubkey later via{" "}
                            <code>infernet pubkey link</code>).
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={mint}
                        className="inline-flex shrink-0 rounded-full bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
                    >
                        {token ? "Re-mint" : "Mint deploy token"}
                    </button>
                </div>
                {signedIn === false ? (
                    <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                        Not signed in. <a href="/auth/login?next=/deploy" className="underline">Sign in</a> or paste your CLI token first via <code>infernet login</code>.
                    </p>
                ) : null}
                {token ? (
                    <p className="mt-4 text-xs text-[var(--muted)]">
                        ✓ Minted. Expires <span className="font-mono text-[var(--accent)]">{expiresAt}</span>.
                    </p>
                ) : null}
                {error ? (
                    <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                        {error}
                    </p>
                ) : null}
            </section>

            {/* The one-liner */}
            <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
                <h2 className="text-lg font-semibold text-white">2. Paste this into your rented box</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                    Works on DigitalOcean, RunPod custom images, AWS, GCP, bare metal — anywhere with{" "}
                    <code>curl</code> and root.
                </p>
                <div className="relative mt-4">
                    <CopyButton text={oneLiner} />
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--panel-strong)] p-4 pr-20 text-xs leading-6 text-[var(--accent)]">
{oneLiner}
                    </pre>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                    Need to override the model or port? See env vars at{" "}
                    <a href={fullUrl} target="_blank" rel="noreferrer" className="underline">
                        /api/deploy/cloud-init
                    </a>
                    .
                </p>
            </section>

            {/* Provider cards */}
            <section className="mb-8 grid gap-4 sm:grid-cols-2">
                <ProviderCard
                    title="DigitalOcean"
                    blurb="Cheapest path: a $0.06/hr CPU droplet boots in ~30s. Use the GPU droplets for inference jobs that need them."
                    steps={[
                        <>
                            Create a Droplet at{" "}
                            <a href="https://cloud.digitalocean.com/droplets/new" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                                cloud.digitalocean.com/droplets/new
                            </a>
                            . Pick a GPU droplet (or any size for CPU-only).
                        </>,
                        <>
                            In <em>Advanced Options → Add Initialization scripts (user data)</em>, paste:
                        </>,
                        <div className="relative">
                            <CopyButton text={`#cloud-config\nruncmd:\n  - ${oneLiner}`} />
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--panel-strong)] p-2 pr-20 text-xs leading-5 text-[var(--accent)]">
{`#cloud-config
runcmd:
  - ${oneLiner}`}
                            </pre>
                        </div>,
                        <>Click Create. The node registers itself within ~2 min.</>
                    ]}
                />
                <ProviderCard
                    title="DigitalOcean (API)"
                    blurb="One-shot from your terminal. Replace $DO_TOKEN with your personal access token, edit region/size/ssh_keys to taste."
                    steps={[
                        <>
                            Get a token at{" "}
                            <a href="https://cloud.digitalocean.com/account/api/tokens" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                                cloud.digitalocean.com/account/api/tokens
                            </a>{" "}
                            (scope: write).
                        </>,
                        <>
                            <code>export DO_TOKEN=&lt;your-token&gt;</code> then run:
                        </>,
                        <div className="relative">
                            <CopyButton text={doApiCmd} />
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--panel-strong)] p-2 pr-20 text-xs leading-5 text-[var(--accent)]">
{doApiCmd}
                            </pre>
                        </div>,
                        <>
                            Browse sizes:{" "}
                            <code>doctl compute size list</code> or see{" "}
                            <a href="https://docs.digitalocean.com/reference/api/api-reference/#tag/Sizes" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                                DO API docs
                            </a>
                            . The user_data field carries the same one-liner the
                            UI flow does — node registers itself within ~2 min.
                        </>
                    ]}
                />
                <ProviderCard
                    title="RunPod"
                    blurb="Cheapest GPU rent. Spin up an RTX 4090 or A100 by the hour. Cold start ~45s for the model pull."
                    steps={[
                        <>
                            Create a Pod at{" "}
                            <a href="https://www.runpod.io/console/pods" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                                runpod.io/console/pods
                            </a>
                            . Pick a GPU + the <code>runpod/base:0.6.2-cuda12.4.1-ubuntu22.04</code> template (or any Ubuntu image).
                        </>,
                        <>Expose TCP port <code>46337</code> (the daemon's P2P port).</>,
                        <>In <em>Container Start Command</em>, paste:</>,
                        <div className="relative">
                            <CopyButton text={`bash -lc "${oneLiner}"`} />
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--panel-strong)] p-2 pr-20 text-xs leading-5 text-[var(--accent)]">
{`bash -lc "${oneLiner}"`}
                            </pre>
                        </div>,
                        <>Deploy. Watch your node appear at <a href="/dashboard" className="text-[var(--accent)] underline">/dashboard</a>.</>
                    ]}
                />
                <ProviderCard
                    title="Bring-your-own (Linux / macOS / WSL2)"
                    blurb="Got a desktop with an idle GPU? Run a node on the hardware you already own. Works on any Linux box, macOS (Apple Silicon or AMD), or Windows via WSL2."
                    steps={[
                        <>
                            <strong className="text-white">Linux / macOS:</strong> open a terminal and paste the
                            one-liner from step 2 above.
                        </>,
                        <>
                            <strong className="text-white">Windows:</strong> enable WSL2 + Ubuntu first
                            (one-time setup), then run the same one-liner inside Ubuntu:
                        </>,
                        <div className="relative">
                            <CopyButton text={`wsl --install -d Ubuntu`} />
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--panel-strong)] p-2 pr-20 text-xs leading-5 text-[var(--accent)]">
{`# From PowerShell — reboot when prompted, then open Ubuntu.
wsl --install -d Ubuntu`}
                            </pre>
                        </div>,
                        <>
                            Install the{" "}
                            <a href="https://www.nvidia.com/Download/index.aspx" target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                                Windows NVIDIA driver
                            </a>{" "}
                            (gives WSL CUDA — no driver inside Ubuntu needed). Then run the one-liner inside Ubuntu.
                        </>,
                        <>
                            Outbound jobs work as-is. For direct P2P inbound on{" "}
                            <code>:46337</code>, add a <code>netsh interface portproxy</code>{" "}
                            rule on the Windows host — optional, only needed for direct peer connections.
                        </>
                    ]}
                />
            </section>

            <ProviderLogos
                heading="Auto-detected on"
                subheading="install.sh scans every mounted filesystem and relocates the install onto whatever big volume your platform exposes — no per-platform config."
            />

            <section className="mt-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
                <h2 className="mb-3 text-lg font-semibold text-white">After it boots</h2>
                <ul className="ml-5 list-disc space-y-1.5">
                    <li>The node registers, pulls the model, opens its P2P port, and starts heartbeating.</li>
                    <li>If you minted a deploy token, the node is auto-linked to your account — visible at <a href="/dashboard" className="text-[var(--accent)] underline">/dashboard</a> within a minute.</li>
                    <li>To swap models later, SSH in and run <code>ollama pull &lt;model&gt;</code> — the next heartbeat will advertise it automatically.</li>
                    <li>To wind down: stop / destroy the box at the cloud provider. Heartbeats stop within 2 min and the node falls out of routing.</li>
                </ul>
            </section>
        </main>
    );
}

function ProviderCard({ title, blurb, steps }) {
    return (
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{blurb}</p>
            <ol className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                {steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-semibold text-[var(--accent)]">
                            {i + 1}
                        </span>
                        <div className="space-y-2">{step}</div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
