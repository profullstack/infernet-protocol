import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifyBearerHeader } from "@/lib/auth/bearer";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const VALID_ROLES = new Set(["provider", "aggregator", "client"]);

/**
 * IPIP-0003 — claim a Nostr pubkey under a Supabase user account.
 *
 * Authenticated by BOTH:
 *   - Authorization: Bearer <CLI JWT>      (proves Supabase user identity)
 *   - X-Infernet-Auth: <signed request>     (proves pubkey ownership)
 *
 * Either alone is insufficient. The bearer alone wouldn't prove control
 * over the Nostr keypair; the Nostr signature alone wouldn't bind to a
 * Supabase user. Requiring both closes the loop and makes /dashboard's
 * `pubkey_links` joins safe.
 *
 * Body:
 *   { role: 'provider' | 'aggregator' | 'client', label?: string }
 *
 * On success, upserts pubkey_links(user_id, pubkey, role, label) and
 * returns the row.
 */
export async function POST(request) {
    return handleRoute(async () => {
        const claims = verifyBearerHeader(request.headers.get("authorization"));
        if (!claims?.sub) {
            const err = new Error("missing or invalid bearer token");
            err.status = 401;
            throw err;
        }

        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const role = typeof json.role === "string" ? json.role.toLowerCase() : null;
        if (!VALID_ROLES.has(role)) {
            const err = new Error(`role must be one of: ${[...VALID_ROLES].join(", ")}`);
            err.status = 400;
            throw err;
        }
        const label = typeof json.label === "string" && json.label.trim()
            ? json.label.trim().slice(0, 80)
            : null;

        const supabase = getSupabaseServerClient();

        // (pubkey, role) is unique. If this pair was already claimed by
        // a different user, refuse — switching ownership requires the
        // other user to delete the link first.
        const { data: existing, error: lookupErr } = await supabase
            .from("pubkey_links")
            .select("id, user_id, label")
            .eq("pubkey", pubkey)
            .eq("role", role)
            .maybeSingle();
        if (lookupErr) {
            const err = new Error(lookupErr.message);
            err.status = 500;
            throw err;
        }

        if (existing && existing.user_id !== claims.sub) {
            const err = new Error("this pubkey/role is already linked to a different account");
            err.status = 409;
            throw err;
        }

        if (existing) {
            // Same user re-claiming — refresh the label if a new one was provided.
            if (label && label !== existing.label) {
                await supabase.from("pubkey_links").update({ label }).eq("id", existing.id);
            }
            return NextResponse.json({
                data: { id: existing.id, user_id: claims.sub, pubkey, role, label: label ?? existing.label, created: false }
            });
        }

        const { data: inserted, error: insertErr } = await supabase
            .from("pubkey_links")
            .insert({ user_id: claims.sub, pubkey, role, label })
            .select("id, user_id, pubkey, role, label, created_at")
            .single();
        if (insertErr) {
            const err = new Error(insertErr.message);
            err.status = 500;
            throw err;
        }

        return NextResponse.json({ data: { ...inserted, created: true } });
    });
}
