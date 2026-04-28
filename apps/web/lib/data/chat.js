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

  // Hard filter: drop saturated nodes. A node with active_jobs at or
  // above its concurrency cap shouldn't get more work — it's currently
  // unable to serve. Default cap = 4 if the node didn't advertise one.
  candidates = candidates.filter(notSaturated);

  if (candidates.length === 0) return null;
  return reputationWeightedPick(candidates);
}

const DEFAULT_CONCURRENCY_CAP = 4;
const HIGH_GPU_UTILIZATION_PCT = 95;

export function notSaturated(p) {
  const load = p?.specs?.load;
  if (!load) return true; // no load info → can't filter; trust the node
  const cap = Number.isFinite(load.concurrency_cap) ? load.concurrency_cap : DEFAULT_CONCURRENCY_CAP;
  if (Number.isFinite(load.active_jobs) && load.active_jobs >= cap) return false;
  // GPU pegged at >95% util means a job is already streaming flat-out;
  // adding another would queue inside Ollama.
  if (Number.isFinite(load.gpu_utilization_max) && load.gpu_utilization_max >= HIGH_GPU_UTILIZATION_PCT) {
    return false;
  }
  return true;
}

/**
 * Pick one provider, weighted by `reputation × throughput × headroom`.
 *
 *   - reputation: trust signal (CPR + history). Floor 1, default 50.
 *   - throughput: rolling tokens_per_second_avg from the last N
 *     completed chat jobs. Default 10 when missing (conservative
 *     baseline so brand-new providers aren't stranded).
 *   - headroom: live free-resource snapshot from the last heartbeat.
 *     Free-RAM-gb plus free-VRAM-gb plus a slot bonus per unused
 *     concurrency cap. Default 1 when missing — i.e. the picker
 *     doesn't penalize providers that don't advertise load yet.
 *
 * The product means: a fast node currently saturated loses to a
 * mid-tier node with headroom. A slow node with lots of free RAM
 * still loses to a fast node with even modest headroom. No single
 * factor monopolizes the ranking.
 *
 * Hard filtering (active_jobs ≥ cap, GPU util ≥ 95%) happens upstream
 * in pickChatProvider — by the time we get here, every candidate is
 * at least nominally available.
 */
export function reputationWeightedPick(candidates, rng = Math.random) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map((c) => {
    const repNum = Number(c.reputation);
    const reputation = Math.max(1, Number.isFinite(repNum) ? repNum : 50);
    const tps = Number(c?.specs?.bench?.tokens_per_second_avg);
    const speed = Number.isFinite(tps) && tps > 0 ? tps : 10;
    const headroom = headroomScore(c);
    return reputation * speed * headroom;
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
 * Headroom score from the candidate's specs.load snapshot.
 * Returns 1 when no load info is available (don't penalize), or a
 * value > 0 representing "how much capacity does this provider have
 * to spare right now":
 *
 *   free_vram_gb + free_ram_gb + slot_bonus
 *
 * where slot_bonus = 4 × (1 - active_jobs/cap), so a fully-idle
 * 4-slot node gets +4, a half-busy one gets +2, fully-busy gets +0.
 *
 * Floor 1 so saturated-but-still-eligible nodes (e.g. one with no
 * load info) get tried at minimal weight rather than zero.
 */
export function headroomScore(c) {
  const load = c?.specs?.load;
  if (!load) return 1;
  const freeRam = Number.isFinite(load.ram?.free_gb) ? load.ram.free_gb : 0;
  const freeVram = Number.isFinite(load.vram?.free_gb) ? load.vram.free_gb : 0;
  const cap = Number.isFinite(load.concurrency_cap) ? load.concurrency_cap : 4;
  const active = Number.isFinite(load.active_jobs) ? load.active_jobs : 0;
  const slotBonus = cap > 0 ? 4 * Math.max(0, 1 - active / cap) : 0;
  return Math.max(1, freeRam + freeVram + slotBonus);
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
