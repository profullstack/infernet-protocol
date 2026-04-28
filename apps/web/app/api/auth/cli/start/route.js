import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * IPIP-0003 phase 3 — kick off a CLI device-code login.
 *
 * The CLI POSTs here, gets back a `code`, prints / opens the
 * `verifyUrl` for the user, then polls `pollUrl` until the user
 * finishes the dashboard sign-in flow at `/auth/cli/<code>`.
 */
export async function POST() {
    const code = randomBytes(16).toString("base64url"); // ~22 chars, URL-safe
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("cli_sessions").insert({
        code,
        expires_at: expiresAt.toISOString()
    });
    if (error) {
        console.error("cli_sessions insert failed:", error.message);
        return NextResponse.json({ error: "could not create session" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
    return NextResponse.json({
        code,
        verify_url: `${appUrl}/auth/cli/${code}`,
        poll_url: `/api/auth/cli/poll/${code}`,
        expires_at: expiresAt.toISOString()
    });
}
