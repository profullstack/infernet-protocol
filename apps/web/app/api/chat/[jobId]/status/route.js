import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/<jobId>/status
 *
 * Reads the persisted job state. The playground / OpenAI shim hits
 * this when the SSE connection drops mid-stream — the browser's
 * native EventSource error has no `.data`, so we have nowhere to
 * surface the real failure reason from the stream itself. This
 * endpoint pulls it from job rows + the most recent error-shaped
 * job_event so the UI can show "Provider OOM'd loading qwen3.5:9b"
 * instead of a generic "Stream error".
 *
 * Public read — no auth, but rate-limited at the Fastly edge layer
 * (and the response body is bounded). The job_events scan caps at
 * 5 most-recent events to keep the row scan tight.
 */
export async function GET(_request, { params }) {
    const { jobId } = await params;
    if (!jobId || typeof jobId !== "string") {
        return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const [{ data: job, error: jobErr }, { data: events, error: evErr }] = await Promise.all([
        supabase
            .from("jobs")
            .select("id, status, error, model_name, provider_id, created_at, completed_at, updated_at")
            .eq("id", jobId)
            .maybeSingle(),
        supabase
            .from("job_events")
            .select("event_type, data, created_at")
            .eq("job_id", jobId)
            .order("id", { ascending: false })
            .limit(5)
    ]);

    if (jobErr) {
        return NextResponse.json({ error: jobErr.message }, { status: 500 });
    }
    if (!job) {
        return NextResponse.json({ error: "job not found" }, { status: 404 });
    }

    const errEvent = (events ?? []).find((e) => e.event_type === "error");

    return NextResponse.json({
        id: job.id,
        status: job.status,
        model_name: job.model_name,
        provider_id: job.provider_id,
        error: job.error ?? null,
        latest_error_message:
            errEvent?.data?.message ?? job.error ?? null,
        completed_at: job.completed_at ?? null,
        updated_at: job.updated_at ?? null
    }, {
        headers: { "cache-control": "no-store" }
    });
}
