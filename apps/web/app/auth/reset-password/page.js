import Link from "next/link";
import AuthFormShell, { AuthInput, AuthButton } from "@/components/auth-form-shell";

export const metadata = { title: "Reset your password" };

export default async function ResetPasswordPage({ searchParams }) {
    const params = (await searchParams) ?? {};
    const error = typeof params.error === "string" ? params.error : null;

    return (
        <AuthFormShell
            title="Reset your password"
            subtitle="Enter the email associated with your account and we'll send you a link to set a new password."
            error={error}
            footer={
                <>
                    Remembered it?{" "}
                    <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
                        Sign in
                    </Link>
                </>
            }
        >
            <form action="/api/auth/reset-password" method="post" className="space-y-4">
                <AuthInput name="email" type="email" label="Email" required autoComplete="email" />
                <AuthButton>Send reset link</AuthButton>
            </form>
        </AuthFormShell>
    );
}
