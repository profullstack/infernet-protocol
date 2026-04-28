import Link from "next/link";

/**
 * Shared layout for the four auth form pages. Centered card, branded
 * header, error banner, footer with cross-links. Pages drop their own
 * <form> children inside.
 */
export default function AuthFormShell({ title, subtitle, error, children, footer }) {
    return (
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <Link href="/" className="mb-8 inline-flex" aria-label="Infernet Protocol home">
                    <img src="/logo.svg" alt="Infernet Protocol" className="h-16 w-auto" />
                </Link>

                <div className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-8 backdrop-blur">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
                    {subtitle ? (
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>
                    ) : null}

                    {error ? (
                        <div className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                            {error}
                        </div>
                    ) : null}

                    <div className="mt-6">{children}</div>
                </div>

                {footer ? (
                    <div className="mt-6 text-center text-sm text-[var(--muted)]">{footer}</div>
                ) : null}
            </div>
        </main>
    );
}

export function AuthInput({ name, type = "text", label, required = false, autoComplete }) {
    return (
        <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
            <input
                name={name}
                type={type}
                required={required}
                autoComplete={autoComplete}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-[var(--panel-strong)] px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
        </label>
    );
}

export function AuthButton({ children, type = "submit" }) {
    return (
        <button
            type={type}
            className="w-full rounded-full bg-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
        >
            {children}
        </button>
    );
}
