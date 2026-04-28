import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isNimConfigured, nimVirtualProvider } from "@infernetprotocol/nim-adapter";

/**
 * Pick a P2P provider to serve a chat job.
 *
 * Filtering:
 *   - status = 'available'
 *   - last_seen within the last 2 minutes (liveness)
 *   - if a model is requested, the provider's specs.served_models must
 *     include it (so we don't route to a node that can't serve the
 *     model — that 500s mid-stream and rots reputation)
 *
 * Selection from the filtered set:
 *   - reputation-weighted random pick. Higher-reputation providers get
 *     proportionally more traffic, but no single node monopolizes the
 *     queue when several qualify. Reputation defaults to 50 so brand-
 *     new providers still get tried.
 *
 * Returns null if no provider qualifies. Callers decide whether to use
 * the NIM fallback (see createChatJob).
 */
export async function pickChatProvider({ modelName } = {}) {
  const supabase = getSupabaseServerClient();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("providers")
    .select("id, node_id, name, reputation, price, gpu_model, specs")
    .eq("status", "available")
    .gte("last_seen", twoMinAgo);

  if (error) throw error;

  let candidates = data ?? [];

  if (typeof modelName === "string" && modelName) {
    candidates = candidates.filter((p) => {
      const served = Array.isArray(p?.specs?.served_models) ? p.specs.served_models : [];
      return served.includes(modelName);
    });
  }

  if (candidates.length === 0) return null;
  return reputationWeightedPick(candidates);
}

/**
 * Pick one provider weighted by `reputation` (default 50). Pure-JS so
 * it's testable without a DB. Exported for tests.
 */
export function reputationWeightedPick(candidates, rng = Math.random) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Floor at 1 so a 0-reputation provider can still occasionally win
  // (and so the weight sum is never 0). Default to 50 only when the
  // value is genuinely missing — `Number(0) || 50` would treat
  // reputation=0 as missing and substitute 50, which is the wrong
  // call: a literal zero is meaningful (brand-new or penalized node).
  const weights = candidates.map((c) => {
    const r = Number(c.reputation);
    const fallback = Number.isFinite(r) ? r : 50;
    return Math.max(1, fallback);
  });
  const total = weights.reduce((a, w) => a + w, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Create a chat job and route it to either a live P2P provider or the
 * NVIDIA NIM fallback. Routing policy:
 *
 *   1. If a P2P provider is available, assign the job to it. The provider
 *      daemon picks it up from its poll loop and streams tokens into
 *      job_events.
 *   2. Otherwise, if NVIDIA_NIM_API_KEY is set, mark the job as running
 *      via the NIM fallback. The SSE stream route detects this and
 *      streams from build.nvidia.com directly while mirroring events
 *      into job_events for a uniform audit trail.
 *   3. If neither is available, the job is left 'pending' and callers
 *      should warn the user that the network is idle.
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.modelName]
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<{ job: Object, provider: Object | null, source: 'p2p' | 'nim' | 'none' }>}
 */
export async function createChatJob({ messages, modelName, maxTokens = 512, temperature = 0.7 }) {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  const p2pProvider = await pickChatProvider({ modelName });
  const nimAvailable = !p2pProvider && isNimConfigured();
  const source = p2pProvider ? "p2p" : nimAvailable ? "nim" : "none";

  const inputSpec = {
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(nimAvailable ? { fallback: "nvidia-nim" } : {})
  };

  const status = p2pProvider ? "assigned" : nimAvailable ? "running" : "pending";

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      title: firstUserPrompt(messages).slice(0, 80) || "chat",
      type: "chat",
      status,
      provider_id: p2pProvider?.id ?? null,
      model_name: modelName ?? null,
      input_spec: inputSpec,
      payment_offer: 0,
      assigned_at: p2pProvider || nimAvailable ? now : null,
      updated_at: now
    })
    .select()
    .single();

  if (error) throw error;

  const provider = p2pProvider ?? (nimAvailable ? nimVirtualProvider() : null);
  return { job, provider, source };
}

function firstUserPrompt(messages) {
  for (const m of messages ?? []) {
    if (m?.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

export async function getJobWithEvents(jobId, sinceId = 0) {
  const supabase = getSupabaseServerClient();
  const [{ data: job, error: jobErr }, { data: events, error: evErr }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase
      .from("job_events")
      .select("id, event_type, data, created_at")
      .eq("job_id", jobId)
      .gt("id", sinceId)
      .order("id", { ascending: true })
  ]);
  if (jobErr) throw jobErr;
  if (evErr) throw evErr;
  return { job, events: events ?? [] };
}

/**
 * Models the playground can offer to clients = distinct
 * specs.served_models across providers that are online right now.
 * Falls back to the (manually curated) `models` table if no provider
 * is advertising anything yet. The fallback exists so the playground
 * isn't blank in dev when nothing is registered.
 */
export async function listChatModels() {
  const supabase = getSupabaseServerClient();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: provs, error: pErr } = await supabase
    .from("providers")
    .select("specs")
    .eq("status", "available")
    .gte("last_seen", tenMinAgo);
  if (pErr) throw pErr;

  const seen = new Set();
  for (const p of provs ?? []) {
    const served = Array.isArray(p?.specs?.served_models) ? p.specs.served_models : [];
    for (const m of served) {
      if (typeof m === "string" && m) seen.add(m);
    }
  }
  if (seen.size > 0) {
    return [...seen].sort().map((name) => ({ id: name, name, family: null, context_length: null }));
  }

  const { data: models, error: mErr } = await supabase
    .from("models")
    .select("id, name, family, context_length")
    .eq("visibility", "public")
    .order("name");
  if (mErr) throw mErr;
  return models ?? [];
}
