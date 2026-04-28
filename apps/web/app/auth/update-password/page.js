import AuthFormShell, { AuthInput, AuthButton } from "@/components/auth-form-shell";

export const metadata = { title: "Set a new password" };

export default async function UpdatePasswordPage({ searchParams }) {
    const params = (await searchParams) ?? {};
    const error = typeof params.error === "string" ? params.error : null;

    return (
        <AuthFormShell
            title="Set a new password"
            subtitle="Pick something at least 8 characters long. We'll sign you in once it's set."
            error={error}
        >
            <form action="/api/auth/update-password" method="post" className="space-y-4">
                <AuthInput name="password" type="password" label="New password" required autoComplete="new-password" />
                <AuthButton>Update password</AuthButton>
            </form>
        </AuthFormShell>
    );
}
