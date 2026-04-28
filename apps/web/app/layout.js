import "./globals.css";

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
  openGraph: {
    title: "Infernet Protocol — We're doing to AI what Bitcoin did to money",
    description:
      "Decentralized GPU compute for inference and training. Operators earn crypto for the GPUs they already have; clients pay in any supported coin.",
    type: "website",
    siteName: "Infernet Protocol"
  },
  twitter: {
    card: "summary_large_image",
    title: "Infernet Protocol — We're doing to AI what Bitcoin did to money",
    description:
      "Decentralized GPU compute — inference and distributed training. No native token, no rent extraction, no permission required."
  },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
