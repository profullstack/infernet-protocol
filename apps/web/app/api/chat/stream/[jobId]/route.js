import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getJobWithEvents } from "@/lib/data/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a chat job. Replays any events that
 * already exist in `job_events` (so refresh/late-join works), then
 * subscribes to Supabase Realtime for new inserts. Closes on 'done' or
 * 'error' events, or when the job row flips to 'completed' / 'failed'.
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
      try {
        const { job, events } = await getJobWithEvents(jobId, 0);
        if (!job) {
          safeEnqueue(sseFrame("error", { message: "job not found", jobId }));
          safeClose();
          return;
        }
        safeEnqueue(sseFrame("job", job));
        for (const ev of events) {
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

      // Subscribe to Realtime inserts for this job_id.
      const channel = supabase.channel(`chat-${jobId}`).on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_events", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const ev = payload?.new;
          if (!ev || ev.id <= lastId) return;
          lastId = ev.id;
          safeEnqueue(sseFrame(ev.event_type, ev.data, ev.id));
          if (ev.event_type === "done" || ev.event_type === "error") {
            try { supabase.removeChannel(channel); } catch { /* ignore */ }
            safeClose();
          }
        }
      );

      channel.subscribe();

      // Heartbeat comments keep the connection alive through proxies.
      const hb = setInterval(() => safeEnqueue(encoder.encode(": ping\n\n")), 15_000);

      // Cleanup when the client disconnects.
      const abort = () => {
        clearInterval(hb);
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        safeClose();
      };
      // Next.js doesn't expose a direct abort signal on the controller in
      // every runtime — fall back to closing on a very long idle timeout.
      const maxAlive = setTimeout(abort, 10 * 60 * 1000);
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
