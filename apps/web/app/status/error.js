"use client";

export default function StatusError({ error, reset }) {
    return (
        <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
            <div className="rounded-[1.5rem] border border-red-400/30 bg-red-400/5 p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-red-300">
                    Network status
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white">
                    Couldn't fetch the live network snapshot.
                </h1>
                <p className="mt-3 text-sm text-[var(--muted)]">
                    {error?.message ?? "Unknown error."}
                </p>
                <button
                    type="button"
                    onClick={() => reset()}
                    className="mt-6 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
