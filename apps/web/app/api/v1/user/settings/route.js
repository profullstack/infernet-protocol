import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/user/settings
 *
 * Form-encoded body (from /settings):
 *   default_is_public      "true" | "false"
 *   node_public[<id>]      "true" (presence = public; absence = private)
 *
 * Updates pubkey_links.default_is_public for the user, plus
 * providers.is_public for each owned provider per the form. Only
 * touches rows the user actually owns (verified via pubkey_links).
 */
export async function POST(request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.redirect(new URL("/auth/login?next=/settings", request.url), 303);
    }
    const form = await request.formData();
    const supabase = getSupabaseServerClient();

    try {
        const defaultIsPublic = form.get("default_is_public") === "true";
        await supabase
            .from("pubkey_links")
            .update({ default_is_public: defaultIsPublic })
            .eq("user_id", user.id);

        // Find the set of provider ids the user actually owns (via the
        // pubkey_links join). Don't trust ids the form posts directly.
        const { data: ownedLinks } = await supabase
            .from("pubkey_links")
            .select("pubkey")
            .eq("user_id", user.id);
        const ownedPubkeys = (ownedLinks ?? []).map((r) => r.pubkey);
        if (ownedPubkeys.length === 0) {
            return NextResponse.redirect(new URL("/settings?saved=1", request.url), 303);
        }

        const { data: ownedProviders } = await supabase
            .from("providers")
            .select("id")
            .in("public_key", ownedPubkeys);
        const ownedIds = new Set((ownedProviders ?? []).map((p) => p.id));

        // Form values: node_public[<id>]="true" means the operator
        // ticked the checkbox; absent means they unticked. Iterate
        // every owned id so unticked rows get is_public=false.
        const updates = [];
        for (const id of ownedIds) {
            const ticked = form.get(`node_public[${id}]`) === "true";
            updates.push(
                supabase
                    .from("providers")
                    .update({ is_public: ticked })
                    .eq("id", id)
            );
        }
        await Promise.all(updates);

        return NextResponse.redirect(new URL("/settings?saved=1", request.url), 303);
    } catch (err) {
        const msg = encodeURIComponent(err?.message ?? "save failed");
        return NextResponse.redirect(new URL(`/settings?error=${msg}`, request.url), 303);
    }
}
