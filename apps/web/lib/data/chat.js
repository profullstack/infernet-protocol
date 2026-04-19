import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Pick a provider to serve a chat job. Simplest policy:
 *   - status = 'available'
 *   - last_seen within the last 2 minutes (liveness check)
 *   - order by reputation DESC, price ASC
 *
 * Returns null if the network has no live providers. Callers decide
 * whether to queue the job or return 503.
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
 * Create a chat job and assign it to a provider in one shot.
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.modelName]
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<{ job: Object, provider: Object | null }>}
 */
export async function createChatJob({ messages, modelName, maxTokens = 512, temperature = 0.7 }) {
  const supabase = getSupabaseServerClient();

  const provider = await pickChatProvider();
  const now = new Date().toISOString();

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      title: firstUserPrompt(messages).slice(0, 80) || "chat",
      type: "chat",
      status: provider ? "assigned" : "pending",
      provider_id: provider?.id ?? null,
      model_name: modelName ?? null,
      input_spec: { messages, max_tokens: maxTokens, temperature },
      payment_offer: 0,
      assigned_at: provider ? now : null,
      updated_at: now
    })
    .select()
    .single();

  if (error) throw error;
  return { job, provider };
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
