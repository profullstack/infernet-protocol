import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { id } = await params;
    return {
        title: `Node ${id} — Infernet`,
        description: `Public details for Infernet node ${id}.`
    };
}

/**
 * Public node details page. Shows operator-friendly info for one
 * provider/aggregator/client by id. Honors the per-node is_public
 * opt-out — nodes with is_public=false return 404 even when they
 * exist, so search engines and curious clickers can't browse a
 * private node by guessing its UUID.
 */
export default async function NodeDetailsPage({ params }) {
    const { id } = await params;
    const node = await loadPublicNode(id);
    if (!node) notFound();

    const specs = (node.specs && typeof node.specs === "object") ? node.specs : {};
    const gpus = Array.isArray(specs.gpus) ? specs.gpus : [];
    const cpu = specs.cpu ?? null;
    const servedModels = Array.isArray(specs.served_models) ? specs.served_models : [];
    const interconnects = specs.interconnects ?? null;
    const lastSeen = node.last_seen ? new Date(node.last_seen) : null;
    const lastSeenAgo = lastSeen ? humanAgo(Date.now() - lastSeen.getTime()) : "never";

    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-12 lg:px-10">
            <header className="mb-8 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
                    {node.role}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl break-words">
                    {node.name ?? node.node_id ?? id}
                </h1>
                <p className="text-sm text-[var(--muted)]">
                    Status:{" "}
                    <span className={node.status === "available" ? "text-emerald-400" : "text-amber-400"}>
                        {node.status}
                    </span>
                    {" · "}Last heartbeat: {lastSeenAgo}
                </p>
            </header>

            <section className="mb-8 grid gap-4 sm:grid-cols-2">
                <Card label="Node ID">
                    <code className="break-all text-xs text-[var(--accent)]">{node.node_id ?? id}</code>
                </Card>
                <Card label="Pubkey">
                    {node.public_key ? (
                        <code className="break-all text-xs text-[var(--accent)]">{node.public_key}</code>
                    ) : (
                        <span className="text-[var(--muted)]">—</span>
                    )}
                </Card>
                <Card label="GPUs">
                    {gpus.length === 0 ? (
                        <span className="text-[var(--muted)]">none advertised</span>
                    ) : (
                        <ul className="space-y-1 text-sm text-white">
                            {gpus.map((g, i) => (
                                <li key={i}>
                                    {g.vendor ?? "?"} · {g.model ?? "?"} · {g.vram_tier ?? g.vram_gb ?? "?"} GB
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
                <Card label="CPU">
                    {cpu ? (
                        <span className="text-sm text-white">
                            {cpu.vendor ?? "?"} · {cpu.cores ?? "?"} cores · {cpu.ram_gb ?? "?"} GB RAM
                        </span>
                    ) : (
                        <span className="text-[var(--muted)]">none advertised</span>
                    )}
                </Card>
            </section>

            <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6">
                <h2 className="text-lg font-semibold text-white">Models served</h2>
                {servedModels.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                        This node hasn&apos;t advertised any models in its most recent heartbeat.
                    </p>
                ) : (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-white">
                        {servedModels.map((m, i) => (
                            <li key={i} className="rounded-lg border border-white/10 bg-[var(--panel-strong)] px-3 py-2">
                                {typeof m === "string" ? m : m?.name ?? "(unknown)"}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {interconnects ? (
                <section className="mb-8 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6">
                    <h2 className="text-lg font-semibold text-white">Interconnect</h2>
                    <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                        {Object.entries(interconnects).map(([k, v]) => (
                            <li key={k}>
                                <span className="uppercase tracking-[0.2em] text-xs text-[var(--accent)] mr-2">{k}</span>
                                <span className="text-white">{String(v)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="rounded-[1.5rem] border border-white/10 bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)]">
                <p>
                    This is a public view of an Infernet node. Operators control visibility
                    per-node from{" "}
                    <Link href="/settings" className="text-[var(--accent)] hover:underline">
                        Settings
                    </Link>
                    {" "}or via <code>INFERNET_PUBLIC=0</code> at registration time.
                </p>
            </section>
        </main>
    );
}

function Card({ label, children }) {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-[var(--panel)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">{label}</p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

async function loadPublicNode(id) {
    const supabase = getSupabaseServerClient();
    // Try providers first (most common), then aggregators, then clients.
    // Each table honors is_public; non-public rows return null →
    // notFound() at the page level so existence isn't leaked.
    for (const table of ["providers", "aggregators", "clients"]) {
        const { data } = await supabase
            .from(table)
            .select("id, name, node_id, role, status, last_seen, specs, public_key, is_public")
            .eq("id", id)
            .eq("is_public", true)
            .maybeSingle();
        if (data) {
            // Add role if not present (clients table doesn't store it).
            return { ...data, role: data.role ?? table.slice(0, -1) };
        }
    }
    return null;
}

function humanAgo(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "never";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
