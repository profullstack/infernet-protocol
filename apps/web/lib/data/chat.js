import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isNimConfigured, nimVirtualProvider } from "@infernetprotocol/nim-adapter";

/**
 * Pick a P2P provider to serve a chat job. Simplest policy:
 *   - status = 'available'
 *   - last_seen within the last 2 minutes (liveness check)
 *   - order by reputation DESC, price ASC
 *
 * Returns null if the network has no live providers. Callers decide
 * whether to use the NIM fallback (see createChatJob).
 */
export async function pickChatProvider() {
  const supabase = getSupabaseServerClient();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("providers")
    .select("id, node_id, name, reputation, price, gpu_model, specs")
    .eq("status", "available")
    .gte("last_seen", twoMinAgo)
    .order("reputation", { ascending: false })
    .order("price", { ascending: true })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) ?? null;
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

  const p2pProvider = await pickChatProvider();
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

export async function listChatModels() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .select("id, name, family, context_length")
    .eq("visibility", "public")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
