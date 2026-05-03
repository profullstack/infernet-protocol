import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TABLES = new Set(["providers", "jobs", "job_events"]);

/**
 * Generic Realtime → SSE bridge. Subscribes to INSERT/UPDATE on the
 * tables named in `?tables=providers,jobs` and emits a `change` event
 * to the client for each row event. The client uses these pings to
 * trigger an in-place refresh (router.refresh()) instead of polling.
 *
 * Tables must be in `ALLOWED_TABLES` (the publication
 * `supabase_realtime` already includes them — see migrations).
 */
export async function GET(request) {
    const url = new URL(request.url);
    const requested = (url.searchParams.get("tables") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    const tables = requested.filter((t) => ALLOWED_TABLES.has(t));
    if (tables.length === 0) {
        return new Response("no allowed tables in ?tables=", { status: 400 });
    }

    const encoder = new TextEncoder();
    const frame = (event, data) =>
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
        start(controller) {
            const supabase = getSupabaseServerClient();
            let closed = false;
            const safeEnqueue = (chunk) => {
                if (closed) return;
                try { controller.enqueue(chunk); } catch { closed = true; }
            };
            const safeClose = () => {
                if (closed) return;
                closed = true;
                try { controller.close(); } catch { /* ignore */ }
            };

            safeEnqueue(frame("ready", { tables }));

            const channelName = `realtime-${tables.join("-")}-${Math.random().toString(36).slice(2)}`;
            let channel = supabase.channel(channelName);
            for (const table of tables) {
                channel = channel.on(
                    "postgres_changes",
                    { event: "*", schema: "public", table },
                    (payload) => {
                        const row = payload?.new ?? payload?.old;
                        safeEnqueue(
                            frame("change", {
                                table,
                                event: payload?.eventType,
                                id: row?.id ?? null,
                                ts: Date.now()
                            })
                        );
                    }
                );
            }
            channel.subscribe();

            const hb = setInterval(() => safeEnqueue(encoder.encode(": ping\n\n")), 15_000);

            const stopAfter = setTimeout(() => safeClose(), 30 * 60 * 1000);
            if (typeof stopAfter.unref === "function") stopAfter.unref();

            const cleanup = () => {
                clearInterval(hb);
                clearTimeout(stopAfter);
                try { supabase.removeChannel(channel); } catch { /* ignore */ }
                safeClose();
            };

            request.signal?.addEventListener("abort", cleanup);
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    });
}
