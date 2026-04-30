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

  const { messages, encryptedMessages, clientPubkey, providerId, modelName, maxTokens, temperature } = payload ?? {};

  // Accept either plaintext messages[] or an encrypted NIP-44 payload.
  const hasPlain = Array.isArray(messages) && messages.length > 0;
  const hasEncrypted = typeof encryptedMessages === "string" && encryptedMessages.length > 0;
  if (!hasPlain && !hasEncrypted) {
    return err(400, "messages[] or encryptedMessages is required");
  }
  if (hasPlain) {
    for (const m of messages) {
      if (!m || typeof m.role !== "string" || typeof m.content !== "string") {
        return err(400, "Each message must be { role, content } strings");
      }
    }
  }

  try {
    const { job, provider, source } = await createChatJob({
      messages: hasPlain ? messages : undefined,
      encryptedMessages: hasEncrypted ? encryptedMessages : undefined,
      clientPubkey: typeof clientPubkey === "string" ? clientPubkey : undefined,
      providerId: typeof providerId === "string" ? providerId : undefined,
      modelName,
      maxTokens,
      temperature
    });
    if (source === "none") {
      return err(503, "The Infernet network has no live providers and the NVIDIA NIM fallback is not configured.", {
        hint: "Set NVIDIA_NIM_API_KEY on the control plane or wait for a provider to come online."
      });
    }
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      source,
      provider: provider
        ? {
            id: provider.id,
            name: provider.name,
            nodeId: provider.node_id,
            gpuModel: provider.gpu_model,
            model: provider.model ?? null,
            pubkey: provider.public_key ?? null
          }
        : null,
      streamUrl: `/api/chat/stream/${job.id}`
    });
  } catch (e) {
    return err(500, "Failed to create chat job", e?.message ?? String(e));
  }
}
