import Link from "next/link";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata = {
    title: "Privacy Policy",
    description:
        "Privacy Policy for Infernet Protocol — what we collect, what we don't, and what flows through the network."
};

const LAST_UPDATED = "2026-04-28";

export default function PrivacyPage() {
    return (
        <>
            <SiteHeader />
            <main className="mx-auto w-full max-w-3xl px-6 py-16 lg:px-10">
                <header className="mb-10 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
                        Legal
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                        Privacy Policy
                    </h1>
                    <p className="text-sm text-[var(--muted)]">Last updated: {LAST_UPDATED}</p>
                </header>

                <div className="space-y-6 text-base leading-7 text-[var(--muted)]">
                    <Section title="1. The short version">
                        <p>
                            Infernet is designed so the <strong>control plane sees as little of your
                            inference traffic as possible</strong>. Prompts and outputs flow
                            client&nbsp;↔&nbsp;operator over SSE; we don&apos;t persist them by default. The
                            <code> infernet</code> CLI authenticates with a Nostr keypair and a HMAC-signed
                            JWT — operators never hand us a database credential.
                        </p>
                    </Section>

                    <Section title="2. What we collect">
                        <ul className="ml-5 list-disc space-y-2">
                            <li>
                                <strong>Account email + Supabase auth metadata</strong> — when you sign up
                                via the dashboard, we store your email and a hashed password through
                                Supabase Auth. Used for sign-in, password reset, and operational notices.
                            </li>
                            <li>
                                <strong>Operator identity (public)</strong> — your Nostr public key,
                                advertised endpoints, and self-reported hardware capabilities. This is
                                public network state, by design.
                            </li>
                            <li>
                                <strong>Job metadata</strong> — job ID, model, status, payment offer, and
                                routing decisions. We do <em>not</em> store the prompts or completions of
                                jobs you submit through the network.
                            </li>
                            <li>
                                <strong>Operational logs</strong> — request paths, status codes, latency,
                                IP for rate-limiting and abuse mitigation. Retained 30 days.
                            </li>
                        </ul>
                    </Section>

                    <Section title="3. What we don't collect">
                        <ul className="ml-5 list-disc space-y-2">
                            <li>Prompts, completions, embeddings, or training data submitted to the network.</li>
                            <li>Wallet seed phrases or private keys. Wallets are non-custodial; we don&apos;t hold the keys.</li>
                            <li>Third-party advertising or marketing trackers — the site has no ads.</li>
                            <li>Cross-site tracking cookies. We use only the session cookie required for sign-in.</li>
                        </ul>
                    </Section>

                    <Section title="4. Subprocessors">
                        <p>We use the following providers to run the service:</p>
                        <ul className="ml-5 list-disc space-y-1">
                            <li><strong>Supabase</strong> — Auth, Postgres, file storage.</li>
                            <li><strong>Resend</strong> — transactional email (sign-up confirmation, password reset).</li>
                            <li><strong>Railway</strong> — application hosting.</li>
                            <li><strong>CoinPayPortal</strong> — non-custodial payment processing for job settlement.</li>
                        </ul>
                        <p>
                            Each subprocessor only receives the minimum data needed to do their job. We
                            don&apos;t share your data with third parties for advertising or analytics.
                        </p>
                    </Section>

                    <Section title="5. Cookies">
                        <p>
                            We use a single first-party session cookie (set by{" "}
                            <code>@supabase/ssr</code>) to keep you signed in. No analytics cookies, no
                            third-party tracking pixels.
                        </p>
                    </Section>

                    <Section title="6. Your rights">
                        <p>
                            You can delete your account at any time from{" "}
                            <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
                                the dashboard
                            </Link>{" "}
                            or by emailing{" "}
                            <a href="mailto:hello@infernetprotocol.com" className="text-[var(--accent)] hover:underline">
                                hello@infernetprotocol.com
                            </a>
                            . Account deletion removes your email, hashed password, and any
                            account-linked metadata. Public network state advertised by your operator key
                            is, by nature, public — rotate the key to retire an identity.
                        </p>
                        <p>
                            EU/UK residents: you have the standard GDPR rights of access, rectification,
                            erasure, restriction, portability, and objection. Email us to exercise any of
                            them.
                        </p>
                    </Section>

                    <Section title="7. Self-hosting">
                        <p>
                            If you self-host the control plane, your deployment is governed by your own
                            privacy policy — this policy applies only to{" "}
                            <code>infernetprotocol.com</code>.
                        </p>
                    </Section>

                    <Section title="8. Contact">
                        <p>
                            Privacy questions or requests:{" "}
                            <a href="mailto:hello@infernetprotocol.com" className="text-[var(--accent)] hover:underline">
                                hello@infernetprotocol.com
                            </a>
                            .
                        </p>
                    </Section>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}

function Section({ title, children }) {
    return (
        <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {children}
        </section>
    );
}
