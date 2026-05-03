export default function NodeLoading() {
    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-12 lg:px-10">
            <div className="mb-8 space-y-3">
                <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                <div className="h-9 w-72 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-56 animate-pulse rounded bg-white/5" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-5">
                        <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                        <div className="mt-3 h-5 w-40 animate-pulse rounded bg-white/10" />
                        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-white/5" />
                    </div>
                ))}
            </div>
        </main>
    );
}
