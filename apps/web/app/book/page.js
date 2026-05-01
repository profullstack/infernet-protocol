import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBookToc, getChapter } from "@/lib/book";

export const dynamic = "force-static";

/** Strip the leading H1 and the inline cover <img> — both are already in the hero. */
function stripFrontMatter(md) {
    if (!md) return "";
    return md
        .replace(/^#[^\n]*\n+/, "")
        .replace(/^<img[^>]*\/>\s*\n+/, "");
}

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
    let intro = "";
    try {
        toc = getBookToc();
        const chapter = getChapter([]);
        intro = stripFrontMatter(chapter?.content);
    } catch {
        // Production deployment may not include docs/book/. Hero +
        // download links still render; chapter list / intro just collapse.
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
                        <a
                            href="/book/infernet-book.html"
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                            Single-page HTML
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

            {/* Rendered intro chapter — server-side HTML for SEO */}
            {intro && (
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                        Introduction
                    </h2>
                    <div className="prose prose-invert prose-sm sm:prose-base max-w-none
                        prose-headings:text-white prose-headings:font-semibold
                        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
                        prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
                        prose-p:text-[var(--muted)] prose-p:leading-7
                        prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline
                        prose-code:text-[var(--accent)] prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                        prose-pre:bg-[var(--panel-strong)] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:text-sm
                        prose-blockquote:border-l-[var(--accent)] prose-blockquote:text-[var(--muted)]
                        prose-strong:text-white
                        prose-table:text-sm prose-th:text-white prose-td:text-[var(--muted)]
                        prose-li:text-[var(--muted)]
                        prose-hr:border-white/10">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {intro}
                        </ReactMarkdown>
                    </div>
                </section>
            )}

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
