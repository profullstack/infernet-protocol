import Link from "next/link";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/api/overview", label: "Overview API" },
  { href: "/api/nodes?limit=10", label: "Nodes API" },
  { href: "/api/jobs?limit=10", label: "Jobs API" },
  { href: "/api/providers?limit=10", label: "Providers API" }
];

export default function DashboardShell({ eyebrow, title, description, children }) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--panel)] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-10">
            <div className="space-y-5">
              <p className="text-sm uppercase tracking-[0.35em] text-[var(--accent)]">{eyebrow}</p>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  {description}
                </p>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--panel-strong)] p-5">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-[var(--muted)]">
                API surface
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-white transition hover:border-[var(--accent)] hover:bg-white/5"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                Supabase credentials stay server-side through `SUPABASE_SERVICE_ROLE_KEY`. No client-side database SDK is used.
              </p>
            </div>
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
