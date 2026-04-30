"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

export default function BookChapter({ chapter }) {
    const { content, title, prev, next } = chapter;

    return (
        <article>
            <div className="prose prose-invert prose-sm sm:prose-base max-w-none
                prose-headings:text-white prose-headings:font-semibold
                prose-h1:text-2xl prose-h1:mb-6
                prose-h2:text-lg prose-h2:mt-10 prose-h2:mb-3
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
                    {content}
                </ReactMarkdown>
            </div>

            {(prev || next) && (
                <nav className="mt-12 flex items-center justify-between border-t border-white/10 pt-6 text-sm">
                    {prev ? (
                        <Link href={prev.href} className="group flex items-center gap-2 text-[var(--muted)] hover:text-white">
                            <span>←</span>
                            <span>{prev.title}</span>
                        </Link>
                    ) : <span />}
                    {next ? (
                        <Link href={next.href} className="group flex items-center gap-2 text-[var(--muted)] hover:text-white">
                            <span>{next.title}</span>
                            <span>→</span>
                        </Link>
                    ) : <span />}
                </nav>
            )}
        </article>
    );
}
