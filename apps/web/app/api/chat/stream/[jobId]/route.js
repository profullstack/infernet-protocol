import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getJobWithEvents } from "@/lib/data/chat";
import { streamChatCompletion } from "@infernetprotocol/nim-adapter";
import { encryptJSON, decryptJSON } from "@/lib/encrypt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a chat job.
 *
 * Two code paths depending on how the job was routed in createChatJob:
 *
 *   - `input_spec.fallback === 'nvidia-nim'`  →  stream directly from
 *     build.nvidia.com, relaying tokens to the client AND mirroring them
 *     into job_events for a uniform audit trail.
 *
 *   - otherwise (real P2P provider)  →  tail `job_events` via Supabase
 *     Realtime; the provider daemon is responsible for writing tokens.
 *
 * In both cases the client sees the same SSE event types:
 *   job | meta | token | done | error
 */
export async function GET(_request, { params }) {
  const { jobId } = await params;
  const encoder = new TextEncoder();

  function sseFrame(eventType, data, id) {
    let out = "";
    if (id != null) out += `id: ${id}\n`;
    out += `event: ${eventType}\n`;
    out += `data: ${JSON.stringify(data)}\n\n`;
    return encoder.encode(out);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const supabase = getSupabaseServerClient();

      let closed = false;
      let lastId = 0;
      const safeEnqueue = (chunk) => {
        if (closed) return;
        try { controller.enqueue(chunk); } catch { closed = true; }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      };

      // Initial payload: job row + any events already persisted.
      let job;
      try {
        const loaded = await getJobWithEvents(jobId, 0);
        job = loaded.job;
        if (!job) {
          safeEnqueue(sseFrame("error", { message: "job not found", jobId }));
          safeClose();
          return;
        }
        safeEnqueue(sseFrame("job", job));
        for (const ev of loaded.events) {
          lastId = Math.max(lastId, ev.id);
          safeEnqueue(sseFrame(ev.event_type, ev.data, ev.id));
          if (ev.event_type === "done" || ev.event_type === "error") {
            safeClose();
            return;
          }
        }
      } catch (e) {
        safeEnqueue(sseFrame("error", { message: e?.message ?? String(e) }));
        safeClose();
        return;
      }

      // Heartbeat keeps the connection alive through proxies in both paths.
      const hb = setInterval(() => safeEnqueue(encoder.encode(": ping\n\n")), 15_000);

      // IPIP-0031: distributed inference. Pick any provider that's
      // contributing to a Petals swarm for the requested model, proxy
      // the request to its /v1/petals/inference endpoint, stream the
      // SSE tokens back to the browser.
      if (job?.input_spec?.distributed) {
        try {
          await runPetalsProxy({ supabase, job, safeEnqueue, sseFrame });
        } catch (e) {
          safeEnqueue(sseFrame("error", { message: e?.message ?? String(e) }));
          await finalizeJob(supabase, job.id, { status: "failed", error: e?.message ?? String(e) }).catch(() => {});
        }
        clearInterval(hb);
        safeClose();
        return;
      }

      const fallback = job?.input_spec?.fallback;
      if (fallback === "nvidia-nim") {
        try {
          await runNimFallback({ supabase, job, safeEnqueue, sseFrame });
        } catch (e) {
          safeEnqueue(sseFrame("error", { message: e?.message ?? String(e) }));
        }
        clearInterval(hb);
        safeClose();
        return;
      }

      // Default P2P path — subscribe to Realtime inserts for this job_id.
      const channel = supabase.channel(`chat-${jobId}`).on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_events", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const ev = payload?.new;
          if (!ev || ev.id <= lastId) return;
          lastId = ev.id;
          safeEnqueue(sseFrame(ev.event_type, decryptJSON(ev.data), ev.id));
          if (ev.event_type === "done" || ev.event_type === "error") {
            try { supabase.removeChannel(channel); } catch { /* ignore */ }
            clearInterval(hb);
            safeClose();
          }
        }
      );
      channel.subscribe();

      // Catch-up: events written between the initial load and the Realtime
      // subscription activating are not delivered by Realtime. One DB query
      // after subscribe closes that race window. The lastId dedup in the
      // Realtime callback above handles any overlap.
      try {
        const { data: catchup } = await supabase
          .from("job_events")
          .select("id, event_type, data, created_at")
          .eq("job_id", jobId)
          .gt("id", lastId)
          .order("id", { ascending: true });
        catchupDone = true;
        for (const ev of catchup ?? []) {
          if (ev.id <= lastId) continue;
          lastId = ev.id;
          safeEnqueue(sseFrame(ev.event_type, decryptJSON(ev.data), ev.id));
          if (ev.event_type === "done" || ev.event_type === "error") {
            try { supabase.removeChannel(channel); } catch { /* ignore */ }
            clearInterval(hb);
            safeClose();
            return;
          }
        }
      } catch {
        // non-fatal; Realtime will still deliver future events
      }

      // Cleanup: absolute upper bound so an abandoned connection can't
      // hold resources forever.
      const maxAlive = setTimeout(() => {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        clearInterval(hb);
        safeClose();
      }, 10 * 60 * 1000);
      if (typeof maxAlive.unref === "function") maxAlive.unref();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive"
    }
  });
}

/**
 * Stream a chat response from NVIDIA NIM. Tokens are enqueued to the
 * client (so the UI sees them live) AND inserted into `job_events` so
 * the job's audit trail looks identical to a real P2P provider run.
 */
/**
 * IPIP-0031: stream tokens from a daemon hosting Petals. We pick any
 * provider whose specs.petals_models includes the requested model,
 * POST the chat to its /v1/petals/inference endpoint, and proxy the
 * resulting SSE frames straight through to the browser.
 *
 * Per-token receipts to the layer-contributing operators (CPR /
 * IPIP-0007) are a follow-up — the proxying is the load-bearing part.
 */
async function runPetalsProxy({ supabase, job, safeEnqueue, sseFrame }) {
  const input = job.input_spec ?? {};
  const messages = input.messages ?? [];
  const model = input.petals_model ?? job.model_name;
  if (!model) throw new Error("distributed inference: model name required");

  // Find a provider serving this model via Petals.
  const { data: candidates } = await supabase
    .from("providers")
    .select("id, public_key, name, address, port, specs, status")
    .eq("status", "available")
    .contains("specs", { petals_models: [model] })
    .limit(5);
  if (!candidates || candidates.length === 0) {
    throw new Error(
      `No Petals server for ${model} on the network. Operators serve a model via ` +
      `\`infernet inference serve --backend petals --model ${model}\`.`
    );
  }
  const provider = candidates[Math.floor(Math.random() * candidates.length)];
  const url = providerEndpoint(provider) + "/v1/petals/inference";

  const persistedMeta = await insertJobEvent(supabase, job.id, "meta", {
    provider_node_id: provider.id,
    provider_name: provider.name,
    model,
    backend: "petals",
    distributed: true,
    started_at: new Date().toISOString()
  });
  if (persistedMeta) safeEnqueue(sseFrame("meta", persistedMeta.data, persistedMeta.id));

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: input.max_tokens ?? 512,
      temperature: input.temperature ?? 0.7
    })
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`upstream daemon ${url} returned HTTP ${upstream.status}`);
  }

  // Parse SSE from the daemon line-by-line and re-emit. Each daemon
  // event looks like:  event: <name>\ndata: {...json...}\n\n
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let lastEventName = "data";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      let evName = lastEventName;
      let evData = null;
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) evName = line.slice(6).trim();
        else if (line.startsWith("data:")) {
          try { evData = JSON.parse(line.slice(5).trim()); } catch { /* skip */ }
        }
      }
      lastEventName = evName;
      if (!evData) continue;
      if (evName === "token") {
        const t = evData.text ?? "";
        fullText += t;
        safeEnqueue(sseFrame("token", { text: t }));
        insertJobEvent(supabase, job.id, "token", { text: t }).catch(() => {});
      } else if (evName === "done") {
        const data = { text: fullText, finished_at: new Date().toISOString() };
        const persisted = await insertJobEvent(supabase, job.id, "done", data);
        safeEnqueue(sseFrame("done", data, persisted?.id));
        await finalizeJob(supabase, job.id, {
          status: "completed",
          result: { type: "chat", text: fullText, source: "petals", provider_id: provider.id }
        });
      } else if (evName === "error") {
        const persisted = await insertJobEvent(supabase, job.id, "error", evData);
        safeEnqueue(sseFrame("error", evData, persisted?.id));
        await finalizeJob(supabase, job.id, { status: "failed", error: evData.message ?? "petals error" });
        return;
      }
    }
  }
}

function providerEndpoint(provider) {
  if (!provider?.address) throw new Error("provider has no advertised address");
  const port = provider.port ?? 8080;
  return `http://${provider.address}:${port}`;
}

async function runNimFallback({ supabase, job, safeEnqueue, sseFrame }) {
  const input = job.input_spec ?? {};
  const messages = input.messages ?? [];
  const model = input.nim_model ?? job.model_name ?? undefined;

  let fullText = "";
  let finalPersisted = false;
  const persistedMeta = await insertJobEvent(supabase, job.id, "meta", {
    provider_node_id: "nvidia-nim",
    provider_name: "NVIDIA NIM (fallback)",
    model: model ?? null,
    started_at: new Date().toISOString()
  });
  if (persistedMeta) safeEnqueue(sseFrame("meta", persistedMeta.data, persistedMeta.id));

  for await (const ev of streamChatCompletion({
    messages,
    model,
    maxTokens: input.max_tokens,
    temperature: input.temperature
  })) {
    if (ev.type === "meta") continue; // we already emitted our own meta above
    if (ev.type === "token") {
      fullText += ev.data?.text ?? "";
      // Enqueue to client immediately; DB insert is audit-only so fire-and-forget.
      safeEnqueue(sseFrame("token", ev.data));
      insertJobEvent(supabase, job.id, "token", ev.data).catch(() => {});
    } else if (ev.type === "done") {
      const data = { text: fullText, finished_at: ev.data?.finished_at ?? new Date().toISOString() };
      const persisted = await insertJobEvent(supabase, job.id, "done", data);
      safeEnqueue(sseFrame("done", data, persisted?.id));
      await finalizeJob(supabase, job.id, { status: "completed", result: { type: "chat", text: fullText, source: "nvidia-nim" } });
      finalPersisted = true;
    } else if (ev.type === "error") {
      const persisted = await insertJobEvent(supabase, job.id, "error", ev.data);
      safeEnqueue(sseFrame("error", ev.data, persisted?.id));
      await finalizeJob(supabase, job.id, { status: "failed", error: ev.data?.message ?? "nim error" });
      finalPersisted = true;
      break;
    }
  }

  // Defensive: if NIM closed without a 'done' frame, still mark the job completed.
  if (!finalPersisted) {
    await finalizeJob(supabase, job.id, { status: "completed", result: { type: "chat", text: fullText, source: "nvidia-nim", incomplete: true } });
  }
}

async function insertJobEvent(supabase, jobId, eventType, data) {
  try {
    const { data: row, error } = await supabase
      .from("job_events")
      .insert({ job_id: jobId, event_type: eventType, data: encryptJSON(data) })
      .select("id, event_type, data, created_at")
      .single();
    if (error) return null;
    // Return with data decrypted so callers can use it directly.
    return row ? { ...row, data: decryptJSON(row.data) } : null;
  } catch {
    return null;
  }
}

async function finalizeJob(supabase, jobId, { status, result, error }) {
  const now = new Date().toISOString();
  const patch = { status, updated_at: now, completed_at: now };
  if (result !== undefined) patch.result = encryptJSON(result);
  if (error !== undefined) patch.error = error;
  try {
    await supabase.from("jobs").update(patch).eq("id", jobId);
  } catch {
    // best-effort
  }
}
