import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";

export const dynamic = "force-dynamic";

function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
}

export async function POST(request) {
    const { email } = await parseAuthBody(request);
    const wantHtml = wantsRedirect(request);

    if (!email) {
        return wantHtml
            ? NextResponse.redirect(
                new URL(`/auth/reset-password?error=${encodeURIComponent("email required")}`, request.url),
                { status: 303 }
            )
            : NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const supabase = await getSupabaseAuthClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl()}/auth/update-password`
    });

    // Per security best-practice, don't leak whether the email exists.
    // Always return the same "check your email" response.
    if (error && !/rate.?limit/i.test(error.message)) {
        // Log server-side; don't surface to the client.
        console.warn(`reset-password: ${error.message}`);
    }

    return wantHtml
        ? NextResponse.redirect(new URL("/auth/check-email?reason=reset", request.url), { status: 303 })
        : NextResponse.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
}
