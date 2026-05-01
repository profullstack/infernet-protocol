import Link from "next/link";
import { getBookToc } from "@/lib/book";

export const dynamic = "force-static";

export const metadata = {
    title: "The Infernet Protocol Book — operator + developer guide",
    description:
        "The complete open-source guide to decentralized GPU inference: running a node, building apps, and the protocol internals. Read online, or download as PDF / EPUB."
};

const AUDIENCES = [
    {
        title: "Node operators",
        body: "You have an NVIDIA, AMD, or Apple Silicon machine and want to earn crypto running LLM inference. Hardware sizing, install, monitoring, payouts.",
        href: "/book/02-node-operators"
    },
    {
        title: "App developers",
        body: "You want OpenAI-compatible APIs without locking into a single provider. REST + streaming chat (SSE), job lifecycle, error handling. JS + Python.",
        href: "/book/04-building-apps"
    },
    {
        title: "Protocol contributors",
        body: "Nostr-style secp256k1 auth, Compute Payment Receipts, multi-chain wallets, and the IPIP-0028 model key hierarchy.",
        href: "/book/05-protocol"
    }
];

export default function BookLandingPage() {
    let toc = [];
    try {
        toc = getBookToc();
    } catch {
        // Production deployment may not include docs/book/. Hero +
        // download links still render; chapter list just collapses.
    }

    return (
        <div className="space-y-16">
            {/* Hero */}
            <section className="grid gap-10 lg:grid-cols-[260px_1fr] lg:items-start">
                <div>
                    <Link href="/book/infernet-book.pdf" target="_blank" rel="noreferrer">
                        <img
                            src="/book/cover.jpg"
                            alt="The Infernet Protocol Book — cover"
                            className="w-full max-w-[260px] rounded-md shadow-2xl ring-1 ring-white/10 transition hover:ring-[var(--accent)]"
                        />
                    </Link>
                </div>
                <div className="space-y-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
                        Free · Open source · MIT
                    </p>
                    <h1 className="text-3xl font-bold text-white sm:text-4xl">
                        The Infernet Protocol Book
                    </h1>
                    <p className="text-lg text-[var(--muted)] leading-7">
                        The complete guide to decentralized GPU inference — for the
                        operators putting hardware on the network, the developers
                        building on top of it, and the contributors shaping the protocol.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Link
                            href="/book/01-introduction"
                            className="rounded-full bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
                        >
                            Read online →
                        </Link>
                        <a
                            href="/book/infernet-book.pdf"
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                            Download PDF
                        </a>
                        <a
                            href="/book/infernet-book.epub"
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                            Download EPUB
                        </a>
                    </div>
                    <p className="pt-2 text-xs text-[var(--muted)]">
                        Sources live at{" "}
                        <a
                            href="https://github.com/infernetprotocol/infernet-protocol/tree/master/docs/book"
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-white"
                        >
                            docs/book on GitHub
                        </a>
                        {" "}— pull requests welcome.
                    </p>
                </div>
            </section>

            {/* Audiences */}
            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                    Who it's for
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    {AUDIENCES.map((a) => (
                        <Link
                            key={a.href}
                            href={a.href}
                            className="group block rounded-lg border border-white/10 bg-white/[0.02] p-5 transition hover:border-[var(--accent)] hover:bg-white/[0.04]"
                        >
                            <h3 className="font-semibold text-white">{a.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{a.body}</p>
                            <p className="mt-3 text-xs text-[var(--accent)] group-hover:underline">
                                Start chapter →
                            </p>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Table of contents */}
            {toc.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                        Table of contents
                    </h2>
                    <ol className="space-y-3">
                        {toc.map((section, i) => (
                            <li key={section.slug} className="rounded-md border border-white/10 bg-white/[0.02] px-5 py-4">
                                <Link
                                    href={section.href}
                                    className="flex items-baseline gap-3 font-semibold text-white hover:text-[var(--accent)]"
                                >
                                    <span className="text-xs text-[var(--muted)]">
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    <span>{section.title}</span>
                                </Link>
                                {section.pages.length > 0 && (
                                    <ul className="mt-3 grid gap-x-6 gap-y-1 pl-7 text-sm sm:grid-cols-2">
                                        {section.pages.map((page) => (
                                            <li key={page.slug}>
                                                <Link
                                                    href={page.href}
                                                    className="text-[var(--muted)] hover:text-white"
                                                >
                                                    {page.title}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    );
}
