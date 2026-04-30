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

        // Verify the node is registered.
        const { data: provider, error: provErr } = await supabase
            .from("providers")
            .select("id")
            .eq("public_key", pubkey)
            .maybeSingle();

        if (provErr) { const e = new Error(provErr.message); e.status = 500; throw e; }

        if (!provider) {
            const err = new Error("node not registered — run `infernet register` first");
            err.status = 404;
            throw err;
        }

        // Look up the owner via pubkey_links (separate table, not a FK join).
        const { data: link, error: linkErr } = await supabase
            .from("pubkey_links")
            .select("user_id")
            .eq("pubkey", pubkey)
            .maybeSingle();

        if (linkErr) { const e = new Error(linkErr.message); e.status = 500; throw e; }

        const userId = link?.user_id ?? null;
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
