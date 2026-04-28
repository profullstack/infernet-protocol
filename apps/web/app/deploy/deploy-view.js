"use client";

import { useEffect, useState } from "react";
import { buildRunpodDeployUrl } from "@/lib/deploy/links";

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
export default function DeployView({ runpodTemplateId = null }) {
    const [token, setToken] = useState(null);
    const [cloudInitUrl, setCloudInitUrl] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [error, setError] = useState(null);
    const [signedIn, setSignedIn] = useState(null);
    const [origin, setOrigin] = useState("https://infernetprotocol.com");
    const [model, setModel] = useState("qwen2.5:7b");

    useEffect(() => {
        if (typeof window !== "undefined") setOrigin(window.location.origin);
    }, []);

    const runpodUrl = runpodTemplateId
        ? buildRunpodDeployUrl({
              templateId: runpodTemplateId,
              bearer: token,
              model,
              controlPlane: origin
          })
        : null;

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
    const oneLiner = `curl -fsSL '${fullUrl}' | bash`;

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

            {/* One-click RunPod deploy — only renders when a template ID is configured. */}
            {runpodTemplateId ? (
                <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
                    <h2 className="text-lg font-semibold text-white">2a. One-click on RunPod</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                        Open RunPod's deploy form with your bearer + model already filled in.
                        Just pick a GPU and click <em>Deploy Pod</em>.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <label className="text-sm text-[var(--muted)]">
                            Model:{" "}
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="ml-2 rounded border border-white/10 bg-[var(--panel-strong)] px-2 py-1 text-sm text-white"
                            >
                                <option value="qwen2.5:0.5b">qwen2.5:0.5b (≈400 MB)</option>
                                <option value="qwen2.5:3b">qwen2.5:3b (≈2 GB)</option>
                                <option value="qwen2.5:7b">qwen2.5:7b (≈4.4 GB)</option>
                                <option value="qwen2.5:14b">qwen2.5:14b (≈9 GB)</option>
                                <option value="qwen2.5:32b">qwen2.5:32b (≈20 GB)</option>
                                <option value="qwen2.5:72b">qwen2.5:72b (≈40 GB)</option>
                            </select>
                        </label>
                        {token && runpodUrl ? (
                            <a
                                href={runpodUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex shrink-0 rounded-full bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
                            >
                                Deploy on RunPod →
                            </a>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="inline-flex shrink-0 cursor-not-allowed rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-[var(--muted)]"
                            >
                                Mint a token first ↑
                            </button>
                        )}
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted)]">
                        The button URL embeds your bearer + chosen model in
                        <code> env[INFERNET_BEARER]</code> /
                        <code> env[INFERNET_MODEL]</code> query params. RunPod's
                        deploy form prefills both. The bearer expires in 24h.
                    </p>
                </section>
            ) : null}

            {/* The one-liner */}
            <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
                <h2 className="text-lg font-semibold text-white">2{runpodTemplateId ? "b" : ""}. Paste this into your rented box</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                    Works on DigitalOcean, RunPod custom images, AWS, GCP, bare metal — anywhere with{" "}
                    <code>curl</code> and root.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--panel-strong)] p-4 text-xs leading-6 text-[var(--accent)]">
{oneLiner}
                </pre>
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
                        <pre className="overflow-x-auto rounded bg-[var(--panel-strong)] p-2 text-xs leading-5 text-[var(--accent)]">
{`#cloud-config
runcmd:
  - ${oneLiner}`}
                        </pre>,
                        <>Click Create. The node registers itself within ~2 min.</>
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
                        <pre className="overflow-x-auto rounded bg-[var(--panel-strong)] p-2 text-xs leading-5 text-[var(--accent)]">
{`bash -lc "${oneLiner}"`}
                        </pre>,
                        <>Deploy. Watch your node appear at <a href="/dashboard" className="text-[var(--accent)] underline">/dashboard</a>.</>
                    ]}
                />
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
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
