export default function DashboardLoading() {
    return (
        <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <div className="mb-8 space-y-3">
                <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                <div className="h-9 w-72 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-96 animate-pulse rounded bg-white/5" />
            </div>

            <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </section>

            <section className="mb-10 grid gap-4 sm:grid-cols-2">
                <CardSkeleton />
                <CardSkeleton />
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                <CardSkeleton tall />
                <div className="space-y-6">
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>
        </main>
    );
}

function CardSkeleton({ tall = false }) {
    return (
        <div className={`rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-5 ${tall ? "min-h-[16rem]" : ""}`}>
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-7 w-32 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-3 w-44 animate-pulse rounded bg-white/5" />
        </div>
    );
}
