import { NextResponse } from "next/server";
import { createChatJob } from "@/lib/data/chat";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 20 messages per IP per hour. Good enough to keep public playground
// usable without letting a single IP burn the whole network.
const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });

function err(status, error, detail) {
  const body = { error };
  if (detail !== undefined) body.detail = detail;
  return NextResponse.json(body, { status });
}

export async function POST(request) {
  const ip = getClientIp(request);
  const r = limit.check(ip);
  if (!r.ok) {
    return err(429, "Rate limit exceeded — try again later", {
      resetAt: new Date(r.resetAt).toISOString()
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  const { messages, modelName, maxTokens, temperature } = payload ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return err(400, "messages[] is required");
  }
  for (const m of messages) {
    if (!m || typeof m.role !== "string" || typeof m.content !== "string") {
      return err(400, "Each message must be { role, content } strings");
    }
  }

  try {
    const { job, provider } = await createChatJob({ messages, modelName, maxTokens, temperature });
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      provider: provider
        ? { id: provider.id, name: provider.name, nodeId: provider.node_id, gpuModel: provider.gpu_model }
        : null,
      streamUrl: `/api/chat/stream/${job.id}`
    });
  } catch (e) {
    return err(500, "Failed to create chat job", e?.message ?? String(e));
  }
}
