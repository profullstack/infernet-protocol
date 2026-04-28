import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session cookie on every request.
 *
 * Required by `@supabase/ssr` — without this, sessions silently
 * expire and Server Components see logged-out state even when the
 * user just authenticated. The pattern is straight from the official
 * Supabase Next.js docs.
 *
 * Skips static assets, the health probe, and a couple of public
 * non-auth API routes that don't need session context.
 */
export async function middleware(request) {
    const response = NextResponse.next({ request });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // If Supabase isn't configured (e.g. local dev without an .env), skip
    // session refresh entirely — pages still render, anonymous users are
    // simply anonymous.
    if (!url || !anonKey) return response;

    const supabase = createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                for (const { name, value } of cookiesToSet) {
                    request.cookies.set(name, value);
                }
                for (const { name, value, options } of cookiesToSet) {
                    response.cookies.set(name, value, options);
                }
            }
        }
    });

    // Touching getUser() forces session refresh + cookie rotation.
    await supabase.auth.getUser();
    return response;
}

export const config = {
    matcher: [
        // Run on everything EXCEPT static assets and the health probe.
        "/((?!_next/static|_next/image|favicon.ico|install\\.sh|.well-known|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
    ]
};
