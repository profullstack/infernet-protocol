import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifySignedNextRequest } from "@/lib/auth/verify-signed-request";
import { issueBearer } from "@/lib/auth/bearer";
import { handleRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/cli/node-token
 *
 * Accepts a Nostr-signed request from a registered node and returns a
 * long-lived CLI bearer token scoped to that node's owner. Lets the
 * daemon obtain a bearer autonomously — no browser login needed.
 *
 * Auth: X-Infernet-Auth (same Nostr signature used by heartbeat/poll).
 * The pubkey must exist in the providers table (i.e. node is registered).
 */
export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey } = await verifySignedNextRequest(request);

        const supabase = getSupabaseServerClient();

        // Look up the registered provider by pubkey to find the owner.
        const { data: provider, error } = await supabase
            .from("providers")
            .select("id, pubkey_links(user_id)")
            .eq("public_key", pubkey)
            .maybeSingle();

        if (error) throw error;

        if (!provider) {
            const err = new Error("node not registered — run `infernet register` first");
            err.status = 404;
            throw err;
        }

        const userId = provider.pubkey_links?.[0]?.user_id ?? null;
        if (!userId) {
            const err = new Error("node has no linked user — run `infernet pubkey link` first");
            err.status = 403;
            throw err;
        }

        // Fetch user email for the token payload.
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        const email = userData?.user?.email ?? null;

        const ttlSeconds = 5 * 365 * 86400;
        const token = issueBearer({ userId, email, ttlSeconds });

        return NextResponse.json({
            token,
            userId,
            email,
            expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
        });
    });
}
