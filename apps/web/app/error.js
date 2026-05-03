"use client";

export default function RootError({ error, reset }) {
    return (
        <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
            <div className="rounded-[1.5rem] border border-red-400/30 bg-red-400/5 p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-red-300">
                    Error
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white">
                    This page hit an error.
                </h1>
                <p className="mt-3 text-sm text-[var(--muted)]">
                    {error?.message ?? "Unknown error."}
                </p>
                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
                    >
                        Try again
                    </button>
                    <a
                        href="/"
                        className="rounded-full border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10"
                    >
                        Home
                    </a>
                </div>
            </div>
        </main>
    );
}
