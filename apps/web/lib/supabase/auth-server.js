import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * IPIP-0003 / IPIP-0005 — server-side cookie-based Supabase Auth client.
 *
 * Browsers NEVER import this. They submit to /api/auth/* routes that
 * call this helper, and Supabase's session cookie comes back on the
 * response. The session lives in an HTTP-only cookie set by `@supabase/ssr`.
 *
 * Two key contracts:
 *   1. `cookies()` is async in Next 15+ / 16 — we await it.
 *   2. `setAll` in a Server Component context will throw; the
 *      middleware (apps/web/middleware.js) is responsible for the
 *      session refresh path. Route handlers and Server Actions can
 *      set cookies normally.
 */
export async function getSupabaseAuthClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
        );
    }
    const cookieStore = await cookies();
    return createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    for (const { name, value, options } of cookiesToSet) {
                        cookieStore.set(name, value, options);
                    }
                } catch {
                    // Server Components can't write cookies — middleware
                    // handles refresh. Ignored intentionally.
                }
            }
        }
    });
}

/**
 * Fetch the currently signed-in user, or null. Use from server
 * components to gate routes / show user-aware UI.
 */
export async function getCurrentUser() {
    const supabase = await getSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
}
