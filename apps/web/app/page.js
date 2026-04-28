import Link from "next/link";

export const metadata = {
  title: "Infernet Protocol — Decentralized GPU inference",
  description:
    "A peer-to-peer GPU inference marketplace. Operators run one CLI command and start earning crypto. Clients pay in any supported coin. No native token, no rent extraction."
};

const INSTALL_ONE_LINER =
  "curl -fsSL https://infernetprotocol.com/install.sh | sh";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-20 sm:py-28 lg:px-10">
          <img
            src="/logo.svg"
            alt="Infernet Protocol"
            className="h-12 w-auto sm:h-14"
          />
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            We&apos;re doing to AI what Bitcoin did to money.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
            A peer-to-peer GPU inference marketplace. Run one CLI command, point it at any model
            you have hardware for, and start earning crypto. No native token, no rent extraction,
            no permission required.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="#run-a-node"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
            >
              Run a node →
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Try /chat
            </Link>
            <Link
              href="/status"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[var(--muted)] transition hover:text-white"
            >
              Live status →
            </Link>
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="border-b border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-3 lg:px-10">
          <Pillar
            eyebrow="For operators"
            title="Earn crypto for the GPU you already have"
            body="Run any model you can serve — Qwen, Llama, Mistral, your own. The control plane routes paying jobs to you and pays out in whichever coin you pasted in. No native token to hold, no platform spread above market."
          />
          <Pillar
            eyebrow="For clients"
            title="Pay in any chain you want"
            body="Submit chat, training, or embedding jobs and pay in BTC, ETH, SOL, USDC on multiple chains, Lightning, or whatever CoinPayPortal supports. The provider you got routed to gets paid; you don't have to learn a new asset to use the network."
          />
          <Pillar
            eyebrow="For the protocol"
            title="The control plane is convenience, not dependency"
            body="Operators authenticate with a Nostr keypair — never a database credential. Discovery bootstraps from infernetprotocol.com, then peers gossip via libp2p Kademlia + Nostr relays. The site can go dark and the network keeps working."
          />
        </div>
      </section>

      {/* Run a node */}
      <section id="run-a-node" className="border-b border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--accent)]">
              Get started
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Run a node in two commands.
            </h2>
            <p className="text-base leading-7 text-[var(--muted)]">
              Linux or macOS. Re-run the installer anytime to update. Operators with their own
              hardware just point Infernet at it and configure payouts; the rest of the stack
              (Ollama, firewall, daemon) is handled by{" "}
              <code className="rounded bg-[var(--panel-strong)] px-1.5 py-0.5 text-[var(--accent)]">
                infernet setup
              </code>
              .
            </p>
            <ul className="space-y-2 text-sm text-[var(--muted)]">
              <li>· Install Ollama, pull a model, open the firewall</li>
              <li>· Configure your payout addresses (BYO wallet or generated)</li>
              <li>· Register with the control plane and start the daemon</li>
            </ul>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[var(--panel-strong)] p-6 font-mono text-sm leading-7 text-[var(--accent)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Install</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-[var(--accent)]">
              {INSTALL_ONE_LINER}
            </pre>
            <p className="mt-6 text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Then</p>
            <pre className="mt-3 text-white">
{`infernet setup            # bootstrap Ollama + model + firewall
infernet "what is 2+2?"   # default verb is chat`}
            </pre>
          </div>
        </div>
      </section>

      {/* Try /chat */}
      <section className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--accent)]">
            Try it now
          </p>
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            The public playground at <Link href="/chat" className="text-[var(--accent)] underline-offset-4 hover:underline">/chat</Link>{" "}
            routes through real provider nodes.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-[var(--muted)]">
            When the network has live providers, your prompt goes to one of them and tokens stream
            back over SSE. When it doesn't (early-launch reality), it falls back to NVIDIA NIM so
            the demo never breaks. Either way, it's the real wire.
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:bg-[var(--accent)]"
          >
            Open /chat →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-10">
        <div className="flex flex-col gap-6 border-t border-white/10 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--muted)]">
            © {new Date().getFullYear()} Infernet Protocol — open source, MIT licensed.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--muted)]">
            <Link href="/docs" className="hover:text-white">
              Docs
            </Link>
            <Link href="/chat" className="hover:text-white">
              Chat
            </Link>
            <Link href="/deploy" className="hover:text-white">
              Deploy
            </Link>
            <Link href="/status" className="hover:text-white">
              Status
            </Link>
            <Link href="/api/peers?limit=10" className="hover:text-white">
              Peers API
            </Link>
            <Link
              href="https://github.com/profullstack/infernet-protocol"
              className="inline-flex items-center gap-1.5 hover:text-white"
              target="_blank"
              rel="noreferrer"
              aria-label="Infernet Protocol on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-.99-.02-1.94-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.66.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
              </svg>
              GitHub
            </Link>
            <Link href="/auth/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Pillar({ eyebrow, title, body }) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-[var(--panel)] p-6 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
        {eyebrow}
      </p>
      <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}
