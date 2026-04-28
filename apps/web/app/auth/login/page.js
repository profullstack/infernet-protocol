import Link from "next/link";
import AuthFormShell, { AuthInput, AuthButton } from "@/components/auth-form-shell";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
    const params = (await searchParams) ?? {};
    const error = typeof params.error === "string" ? params.error : null;

    return (
        <AuthFormShell
            title="Sign in"
            subtitle="Use your password, or leave it blank and we'll send a magic link."
            error={error}
            footer={
                <>
                    No account?{" "}
                    <Link href="/auth/signup" className="text-[var(--accent)] hover:underline">
                        Sign up
                    </Link>{" "}
                    ·{" "}
                    <Link href="/auth/reset-password" className="text-[var(--accent)] hover:underline">
                        Forgot password?
                    </Link>
                </>
            }
        >
            <form action="/api/auth/login" method="post" className="space-y-4">
                <AuthInput name="email" type="email" label="Email" required autoComplete="email" />
                <AuthInput name="password" type="password" label="Password (optional)" autoComplete="current-password" />
                <AuthButton>Sign in</AuthButton>
            </form>
        </AuthFormShell>
    );
}
