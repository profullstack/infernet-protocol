import { NextResponse } from "next/server";
import { pickChatProvider } from "@/lib/data/chat";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 60 });

function err(status, error) {
    return NextResponse.json({ error }, { status });
}

/**
 * GET /api/chat/provider?modelName=qwen2.5:7b&minTrustTier=public
 *
 * Pre-select a provider and return its public key so the client can
 * derive the NIP-44 shared secret before encrypting the prompt (IPIP-0027).
 * The reservation window is handled by the client doing the POST to
 * /api/chat within a reasonable time — no server-side lock needed for v1.
 */
export async function GET(request) {
    const ip = getClientIp(request);
    const r = limit.check(ip);
    if (!r.ok) return err(429, "Rate limit exceeded");

    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get("modelName") ?? undefined;

    let provider;
    try {
        provider = await pickChatProvider({ modelName });
    } catch (e) {
        return err(500, e?.message ?? String(e));
    }

    if (!provider) {
        return NextResponse.json(
            { error: "No providers available", hint: "Try again shortly or omit modelName to widen the pool." },
            { status: 503 }
        );
    }

    const pubkey = provider.public_key ?? null;

    return NextResponse.json({
        providerId: provider.id,
        providerPubkey: pubkey,
        model: modelName ?? null,
        reservedUntil: new Date(Date.now() + 30_000).toISOString()
    });
}
