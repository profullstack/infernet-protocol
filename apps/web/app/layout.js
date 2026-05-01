import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata = {
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com"
    ),
    title: {
        default: "Infernet Protocol — Decentralized GPU compute",
        template: "%s · Infernet Protocol"
    },
    description:
        "A peer-to-peer GPU compute marketplace for inference and distributed training. Run one CLI command, point it at the hardware you have, and start earning crypto. No native token, no rent extraction.",
    applicationName: "Infernet Protocol",
    appleWebApp: {
        capable: true,
        title: "Infernet",
        statusBarStyle: "black-translucent"
    },
    formatDetection: {
        telephone: false
    },
    openGraph: {
        title: "Infernet Protocol — We're doing to AI what Bitcoin did to money",
        description:
            "Decentralized GPU compute for inference and training. Operators earn crypto for the GPUs they already have; clients pay in any supported coin.",
        type: "website",
        siteName: "Infernet Protocol",
        url: "/",
        images: [{ url: "/og-image.png", width: 1200, height: 630 }]
    },
    twitter: {
        card: "summary_large_image",
        title: "Infernet Protocol — We're doing to AI what Bitcoin did to money",
        description:
            "Decentralized GPU compute — inference and distributed training. No native token, no rent extraction, no permission required.",
        site: "@infernetproto",
        images: ["/og-image.png"]
    },
    manifest: "/manifest.json",
    icons: {
        icon: [
            { url: "/favicon.svg", type: "image/svg+xml" },
            { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
            { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }
        ],
        shortcut: "/favicon.ico",
        apple: [
            { url: "/icons/apple-touch-icon-180x180.png", sizes: "180x180" },
            { url: "/icons/apple-touch-icon-152x152.png", sizes: "152x152" },
            { url: "/icons/apple-touch-icon-144x144.png", sizes: "144x144" },
            { url: "/icons/apple-touch-icon-120x120.png", sizes: "120x120" },
            { url: "/icons/apple-touch-icon-114x114.png", sizes: "114x114" },
            { url: "/icons/apple-touch-icon-76x76.png",   sizes: "76x76" },
            { url: "/icons/apple-touch-icon-72x72.png",   sizes: "72x72" },
            { url: "/icons/apple-touch-icon-60x60.png",   sizes: "60x60" },
            { url: "/icons/apple-touch-icon-57x57.png",   sizes: "57x57" }
        ]
    },
    other: {
        "msapplication-TileColor": "#0a0a0a",
        "msapplication-TileImage": "/icons/apple-touch-icon-144x144.png",
        "msapplication-config": "/browserconfig.xml",
        "mobile-web-app-capable": "yes"
    }
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#0a0a0a",
    colorScheme: "dark"
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className="flex min-h-screen flex-col">
                {/* SiteHeader is async (reads the user) — Next.js handles
                    the suspense boundary automatically. */}
                <SiteHeader />
                <div className="flex-1">{children}</div>
                <SiteFooter />
            </body>
        </html>
    );
}
