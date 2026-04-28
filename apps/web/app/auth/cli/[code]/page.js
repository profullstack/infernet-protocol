import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import AuthFormShell from "@/components/auth-form-shell";

export const dynamic = "force-dynamic";

/**
 * IPIP-0003 phase 3 — landing page for the CLI device-code flow.
 *
 * The CLI hands the user a URL like:
 *   https://infernetprotocol.com/auth/cli/<code>
 *
 * If the user isn't signed in: redirect to /auth/login with `next` set
 * back here. Once signed in, mark the matching cli_sessions row as
 * authorized — the CLI's poll loop then mints + delivers a bearer
 * token to the terminal.
 */
export default async function CliAuthPage({ params }) {
    const { code } = await params;

    const user = await getCurrentUser();
    if (!user) {
        redirect(`/auth/login?next=${encodeURIComponent(`/auth/cli/${code}`)}`);
    }

    const supabase = getSupabaseServerClient();
    const { data: row, error } = await supabase
        .from("cli_sessions")
        .select("code, expires_at, authorized_at, consumed_at")
        .eq("code", code)
        .maybeSingle();

    if (error) {
        return (
            <AuthFormShell
                title="Something went wrong"
                subtitle="Could not look up the CLI session."
            />
        );
    }
    if (!row) {
        return (
            <AuthFormShell
                title="Session not found"
                subtitle={`No CLI login session for code ${code}. The link may be wrong, or the session expired.`}
            />
        );
    }
    if (new Date(row.expires_at) < new Date()) {
        return (
            <AuthFormShell
                title="Session expired"
                subtitle="This CLI login link has expired. Run `infernet login` again to get a fresh one."
            />
        );
    }
    if (row.consumed_at) {
        return (
            <AuthFormShell
                title="Already used"
                subtitle="This CLI login link has already been used. You can close this tab — the CLI received the token."
            />
        );
    }

    if (!row.authorized_at) {
        await supabase
            .from("cli_sessions")
            .update({ user_id: user.id, authorized_at: new Date().toISOString() })
            .eq("code", code);
    }

    return (
        <AuthFormShell
            title="CLI signed in"
            subtitle={`You're signed in as ${user.email ?? user.id}. Return to your terminal — it should pick this up within a couple of seconds. You can close this tab.`}
        />
    );
}
