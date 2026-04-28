import Link from "next/link";

const PRODUCT = [
    { href: "/docs", label: "Docs" },
    { href: "/faq", label: "FAQ" },
    { href: "/chat", label: "Chat" },
    { href: "/deploy", label: "Deploy" },
    { href: "/status", label: "Status" }
];

const COMPANY = [
    { href: "/careers", label: "Careers" },
    { href: "/contact", label: "Contact" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    {
        href: "https://github.com/profullstack/infernet-protocol",
        label: "GitHub",
        external: true
    }
];

export default function SiteFooter() {
    return (
        <footer className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-10">
            <div className="grid gap-10 border-t border-white/10 pt-10 sm:grid-cols-[1.4fr_1fr_1fr]">
                <div className="space-y-3">
                    <Link href="/" aria-label="Infernet Protocol home" className="inline-flex">
                        <img src="/logo.svg" alt="Infernet Protocol" className="h-14 w-auto" />
                    </Link>
                    <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">
                        Decentralized GPU compute for inference and distributed training. No native
                        token, no rent extraction.
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                        <a
                            href="mailto:hello@infernetprotocol.com"
                            className="hover:text-white"
                        >
                            hello@infernetprotocol.com
                        </a>
                    </p>
                </div>

                <FooterColumn title="Product" items={PRODUCT} />
                <FooterColumn title="Company" items={COMPANY} />
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
                <p>© {new Date().getFullYear()} Infernet Protocol — open source, MIT licensed.</p>
                <p>
                    <Link href="/auth/login" className="hover:text-white">
                        Sign in
                    </Link>
                </p>
            </div>
        </footer>
    );
}

function FooterColumn({ title, items }) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                {title}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
                {items.map((item) => (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            className="text-[var(--muted)] hover:text-white"
                            target={item.external ? "_blank" : undefined}
                            rel={item.external ? "noreferrer" : undefined}
                        >
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
