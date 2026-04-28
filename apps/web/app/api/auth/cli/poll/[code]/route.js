import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { issueBearer } from "@/lib/auth/bearer";

export const dynamic = "force-dynamic";

/**
 * The CLI polls this every ~2s after kicking off a device-code login.
 * Returns one of:
 *   { status: "pending" }         user hasn't visited /auth/cli/<code> yet
 *   { status: "expired" }         the 10-min session window passed
 *   { status: "consumed" }        token was already issued and read
 *   { status: "authorized", token, userId, email, expiresAt }
 *                                 user signed in — return token, mark consumed
 *   { status: "not_found" }       bogus code
 *
 * The token is generated on this call (not stored in cli_sessions);
 * the row only flips authorized → consumed. That keeps secrets out of
 * the DB column space.
 */
export async function GET(_request, { params }) {
    const { code } = await params;
    if (!code) {
        return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    const supabase = getSupabaseServerClient();
    const { data: row, error } = await supabase
        .from("cli_sessions")
        .select("user_id, authorized_at, consumed_at, expires_at")
        .eq("code", code)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ status: "not_found" }, { status: 404 });
    }
    if (new Date(row.expires_at) < new Date()) {
        return NextResponse.json({ status: "expired" });
    }
    if (row.consumed_at) {
        return NextResponse.json({ status: "consumed" });
    }
    if (!row.authorized_at || !row.user_id) {
        return NextResponse.json({ status: "pending" });
    }

    // Authorized — fetch user details, mint bearer, mark consumed atomically-ish.
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(row.user_id);
    if (userErr || !userData?.user) {
        return NextResponse.json({ status: "error", message: "user lookup failed" }, { status: 500 });
    }

    const ttlSeconds = 30 * 86400;
    const token = issueBearer({
        userId: row.user_id,
        email: userData.user.email ?? null,
        ttlSeconds
    });

    await supabase
        .from("cli_sessions")
        .update({ consumed_at: new Date().toISOString() })
        .eq("code", code);

    return NextResponse.json({
        status: "authorized",
        token,
        userId: row.user_id,
        email: userData.user.email ?? null,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    });
}
