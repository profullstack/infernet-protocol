import { siGooglecloud, siDigitalocean, siPaperspace } from "simple-icons";

/**
 * Strip of GPU/cloud platforms our installer auto-detects + relocates
 * onto. Each tile is a link to the provider's homepage. Where simple-icons
 * has the brand mark we render their SVG path; otherwise the company
 * name is a styled wordmark (avoids embedding copyrighted logos for
 * brands with restrictive trademark policies).
 *
 * Uniform grayscale via `text-white/40` + `hover:text-white`. SVGs use
 * `currentColor` so they pick up that styling automatically.
 */
const PROVIDERS = [
    { name: "RunPod",       url: "https://runpod.io",            icon: null },
    { name: "Vast.ai",      url: "https://vast.ai",              icon: null },
    { name: "Paperspace",   url: "https://paperspace.com",       icon: siPaperspace },
    { name: "CoreWeave",    url: "https://coreweave.com",        icon: null },
    { name: "Lambda",       url: "https://lambdalabs.com",       icon: null },
    { name: "AWS",          url: "https://aws.amazon.com",       icon: null },
    { name: "Google Cloud", url: "https://cloud.google.com",     icon: siGooglecloud },
    { name: "Azure",        url: "https://azure.microsoft.com",  icon: null },
    { name: "DigitalOcean", url: "https://digitalocean.com",     icon: siDigitalocean }
];

export default function ProviderLogos({
    heading = "Works on",
    subheading = "One installer, host-agnostic. The script auto-detects whichever volume your GPU box mounts and puts the install there."
}) {
    return (
        <section className="border-t border-white/10">
            <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-10">
                <div className="space-y-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
                        {heading}
                    </p>
                    {subheading ? (
                        <p className="mx-auto max-w-2xl text-sm leading-6 text-[var(--muted)]">
                            {subheading}
                        </p>
                    ) : null}
                </div>
                <ul className="mt-8 grid grid-cols-3 items-center justify-items-center gap-x-6 gap-y-8 sm:grid-cols-5 lg:grid-cols-9">
                    {PROVIDERS.map((p) => (
                        <li key={p.name} className="flex h-10 items-center justify-center">
                            <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={p.name}
                                title={p.name}
                                className="flex h-10 items-center justify-center text-white/40 transition hover:text-white"
                            >
                                {p.icon ? (
                                    <svg
                                        role="img"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        className="h-7 w-7"
                                        aria-hidden="true"
                                    >
                                        <path d={p.icon.path} />
                                    </svg>
                                ) : (
                                    <span className="whitespace-nowrap text-sm font-semibold tracking-tight">
                                        {p.name}
                                    </span>
                                )}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
