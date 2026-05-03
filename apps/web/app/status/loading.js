import DashboardShell from "@/components/dashboard-shell";

export default function StatusLoading() {
    return (
        <DashboardShell
            eyebrow="Network status"
            title="Infernet network status"
            description="Live snapshot of nodes, jobs, providers, models, clients, and aggregators on the network."
        >
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-5">
                        <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-white/10" />
                        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-white/5" />
                    </div>
                ))}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
                <TableSkeleton rows={4} />
                <TableSkeleton rows={4} />
            </div>
        </DashboardShell>
    );
}

function TableSkeleton({ rows = 4 }) {
    return (
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6">
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-4 space-y-3">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="h-4 w-full animate-pulse rounded bg-white/5" />
                ))}
            </div>
        </div>
    );
}
