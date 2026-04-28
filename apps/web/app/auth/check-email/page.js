import Link from "next/link";
import AuthFormShell from "@/components/auth-form-shell";

export const metadata = { title: "Check your email" };

const COPY = {
    signup: {
        title: "Confirm your email",
        body: "We sent a confirmation link to the address you signed up with. Click it to verify your account and finish signing in."
    },
    "magic-link": {
        title: "Magic link sent",
        body: "Check your inbox for a sign-in link. It expires in a few minutes."
    },
    reset: {
        title: "Reset link sent",
        body: "If that email is registered, you'll receive a link to set a new password. Check your inbox (and spam folder)."
    }
};

export default async function CheckEmailPage({ searchParams }) {
    const params = (await searchParams) ?? {};
    const reason = typeof params.reason === "string" ? params.reason : "magic-link";
    const copy = COPY[reason] ?? COPY["magic-link"];

    return (
        <AuthFormShell
            title={copy.title}
            subtitle={copy.body}
            footer={
                <>
                    Didn't get it? Try{" "}
                    <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
                        signing in again
                    </Link>{" "}
                    or check your spam folder.
                </>
            }
        >
            <p className="text-center text-sm text-[var(--muted)]">
                You can close this tab — the email link will continue the flow.
            </p>
        </AuthFormShell>
    );
}
