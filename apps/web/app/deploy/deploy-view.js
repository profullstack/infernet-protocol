"use client";

import { useState } from "react";

/**
 * One-click deploy UI.
 *
 * Flow:
 *   1. User pastes their RunPod API key.
 *   2. We hit /api/deploy/runpod/gpu-types to list GPUs visible to them.
 *   3. They pick a GPU + name the node + paste control-plane creds.
 *   4. POST /api/deploy/runpod spins up a pod running the infernet
 *      provider image. Response shows the deployment id.
 *
 * Credentials: the user's RunPod API key and the Supabase service-role
 * key are both sent in the request body and immediately dropped by the
 * server. They are NOT stored. We display a prominent disclosure.
 */
export default function DeployView() {
  const [apiKey, setApiKey] = useState("");
  const [gpuTypes, setGpuTypes] = useState([]);
  const [gpuTypeId, setGpuTypeId] = useState("");
  const [loadingGpus, setLoadingGpus] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("provider");
  const [deploying, setDeploying] = useState(false);
  const [deployment, setDeployment] = useState(null);
  const [error, setError] = useState(null);

  async function listGpus() {
    if (!apiKey) {
      setError("Paste your RunPod API key first.");
      return;
    }
    setError(null);
    setLoadingGpus(true);
    setGpuTypes([]);
    setGpuTypeId("");
    try {
      const res = await fetch("/api/deploy/runpod/gpu-types", {
        headers: { "x-runpod-api-key": apiKey }
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setGpuTypes(body.gpuTypes ?? []);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoadingGpus(false);
    }
  }

  async function deploy() {
    if (!apiKey || !gpuTypeId || !supabaseUrl || !supabaseServiceRoleKey) {
      setError("Fill in API key, GPU type, and Supabase credentials.");
      return;
    }
    setError(null);
    setDeploying(true);
    setDeployment(null);
    try {
      const res = await fetch("/api/deploy/runpod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          gpuTypeId,
          supabaseUrl,
          supabaseServiceRoleKey,
          name: name || undefined,
          role
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setDeployment(body);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setDeploying(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--accent)]">One-click deploy</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Rent a GPU, earn crypto</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Launch an Infernet provider on RunPod in one click. Your pod boots from a prebuilt image, registers with the control plane, and starts accepting inference jobs automatically. No SSH. No package install.
          </p>
          <p className="mt-4 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-xs leading-5 text-[var(--warn)]">
            Credentials (RunPod API key, Supabase service-role key) are proxied through the server and <strong>never stored</strong>. They are used once to launch the pod and forgotten. Inspect the network tab if you want to verify.
          </p>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6">
          <h2 className="text-lg font-semibold text-white">1. RunPod</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Get an API key at <a className="underline" href="https://www.runpod.io/console/user/settings" target="_blank" rel="noreferrer">runpod.io/console/user/settings</a>.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 font-mono text-xs text-white outline-none"
            />
            <button
              type="button"
              onClick={listGpus}
              disabled={loadingGpus || !apiKey}
              className="rounded-xl bg-[var(--accent-strong)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-black disabled:opacity-40"
            >
              {loadingGpus ? "…" : "List GPUs"}
            </button>
          </div>

          {gpuTypes.length > 0 ? (
            <div className="mt-4">
              <label className="block text-xs uppercase tracking-[0.25em] text-[var(--muted)]">GPU type</label>
              <select
                value={gpuTypeId}
                onChange={(e) => setGpuTypeId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-white"
              >
                <option value="">— select —</option>
                {gpuTypes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {(g.vramMb / 1024).toFixed(0)} GB · ${g.pricePerHour ?? "?"}/hr · {g.region}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6">
          <h2 className="text-lg font-semibold text-white">2. Control plane</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Where should the node report home? Use your own self-hosted Supabase or the Infernet cloud URL.
          </p>
          <div className="mt-4 grid gap-3">
            <input
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://<project-ref>.supabase.co"
              className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-white outline-none"
            />
            <input
              type="password"
              value={supabaseServiceRoleKey}
              onChange={(e) => setSupabaseServiceRoleKey(e.target.value)}
              placeholder="Supabase service-role key"
              className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 font-mono text-xs text-white outline-none"
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[var(--panel)] p-6">
          <h2 className="text-lg font-semibold text-white">3. Node</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional node name"
              className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-white outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-white"
            >
              <option value="provider">provider</option>
              <option value="aggregator">aggregator</option>
            </select>
          </div>
          <button
            type="button"
            onClick={deploy}
            disabled={deploying || !gpuTypeId}
            className="mt-5 w-full rounded-xl bg-[var(--accent-strong)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black disabled:opacity-40"
          >
            {deploying ? "Deploying…" : "Deploy to RunPod"}
          </button>
        </section>

        {error ? (
          <div className="rounded-2xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-sm text-[var(--warn)]">
            {error}
          </div>
        ) : null}

        {deployment ? (
          <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-4 text-sm text-white">
            <p className="font-semibold">Pod launched 🎉</p>
            <pre className="mt-2 overflow-x-auto text-xs text-[var(--muted)]">{JSON.stringify(deployment, null, 2)}</pre>
            <p className="mt-2 text-xs text-[var(--muted)]">
              It may take 1–3 minutes to boot and register. Watch for it on the <a className="underline" href="/">dashboard</a>.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
