export const metadata = {
    title: "Careers — Infernet Protocol",
    description:
        "Build a decentralized GPU compute marketplace. Open roles: DiPaC Architect (equity-only) and Internship (AI babysitter)."
};

const ROLES = [
    {
        title: "DiPaC Architect",
        compensation: "Equity-only",
        location: "Remote",
        body: [
            "You'll own the distributed-parallel-compute architecture: workload class A/B/B.5/C routing, federated model hosting (Petals-style pipeline parallelism), training orchestration (DeepSpeed / OpenDiLoCo / OpenRLHF). Read IPIPs 0009-0012 to see where we're at.",
            "We're early — equity over salary is the deal. If you want to ship the protocol layer for decentralized inference and training, this is the seat."
        ]
    },
    {
        title: "Internship (AI babysitter)",
        compensation: "Stipend + equity",
        location: "Remote",
        body: [
            "A code monkey with real engineering chops who manages AI agents (Claude Code, Codex, etc.) instead of typing every line by hand. You write the prompts, review the diffs, push the buttons, and own the outcome — the AI is your apprentice, not your replacement.",
            "Day-to-day: drive AI agents through real PRs (engine adapters, dashboards, daemon fixes), spot when they're hallucinating APIs, redirect when they go off-rails, and ship the result. You'll need enough engineering judgment to recognize bad code when an agent confidently produces it.",
            "Curiosity > credentials. We don't care if you're a CS junior or self-taught — we care that you can read a stack trace, write a correct prompt, and ship a fix the same day."
        ]
    }
];

const COURSEWORK = [
    "MIT 6.824 / 6.5840 — Distributed Systems",
    "DelftX — Modern Distributed Systems",
    "Georgia Tech CS 7210 — Distributed Computing",
    "Coursera / Rice — Parallel, Concurrent, and Distributed Programming in Java",
    "Georgia Tech — High Performance Computing",
    "Coursera — Intro to High-Performance and Parallel Computing"
];

export default function CareersPage() {
    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-16 lg:px-10">
            <header className="mb-12 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
                    Careers
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Build the protocol layer for decentralized AI.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)]">
                    We're an early team shipping a peer-to-peer GPU compute marketplace. If
                    you want to work on distributed inference, federated training, P2P
                    networking, and the economic substrate that ties them together — read on.
                </p>
            </header>

            <section className="mb-12 space-y-6">
                {ROLES.map((role) => (
                    <RoleCard key={role.title} role={role} />
                ))}
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-8 backdrop-blur">
                <h2 className="text-lg font-semibold text-white">Nice-to-have coursework</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Not required, but if you've taken (or audited) any of these on edX /
                    Coursera, mention it — they map directly to the work.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
                    {COURSEWORK.map((course) => (
                        <li key={course} className="flex gap-3">
                            <span aria-hidden="true" className="text-[var(--accent)]">·</span>
                            <span>{course}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-10 rounded-[1.5rem] border border-white/10 bg-[var(--panel-strong)] p-6 text-sm text-[var(--muted)]">
                Don&apos;t see a fit but think you&apos;d be useful? Email{" "}
                <a
                    href="mailto:hello@infernetprotocol.com?subject=Open%20application"
                    className="text-[var(--accent)] hover:underline"
                >
                    hello@infernetprotocol.com
                </a>{" "}
                with what you&apos;d work on.
            </section>
        </main>
    );
}

function RoleCard({ role }) {
    const subject = encodeURIComponent(role.title);
    const mailto = `mailto:hello@infernetprotocol.com?subject=${subject}`;
    return (
        <article className="rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-8 backdrop-blur">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {role.title}
                </h2>
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    <span className="rounded-full border border-white/15 px-3 py-1">
                        {role.compensation}
                    </span>
                    <span className="rounded-full border border-white/15 px-3 py-1">
                        {role.location}
                    </span>
                </div>
            </div>
            <div className="mt-5 space-y-3 text-sm leading-7 text-[var(--muted)]">
                {role.body.map((p, i) => (
                    <p key={i}>{p}</p>
                ))}
            </div>
            <div className="mt-6">
                <a
                    href={mailto}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
                >
                    Apply →
                </a>
            </div>
        </article>
    );
}
