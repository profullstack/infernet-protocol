import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";

export const dynamic = "force-dynamic";

function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
}

export async function POST(request) {
    const { email, password } = await parseAuthBody(request);
    const wantHtml = wantsRedirect(request);

    if (!email || !password) {
        if (wantHtml) {
            return NextResponse.redirect(
                new URL(`/auth/signup?error=${encodeURIComponent("email and password required")}`, request.url),
                { status: 303 }
            );
        }
        return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const supabase = await getSupabaseAuthClient();
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${appUrl()}/api/auth/callback?next=/status` }
    });

    if (error) {
        if (wantHtml) {
            return NextResponse.redirect(
                new URL(`/auth/signup?error=${encodeURIComponent(error.message)}`, request.url),
                { status: 303 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (wantHtml) {
        return NextResponse.redirect(new URL("/auth/check-email?reason=signup", request.url), { status: 303 });
    }
    return NextResponse.json({ ok: true, message: "Confirmation email sent. Check your inbox." });
}
