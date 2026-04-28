import "./globals.css";

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com"
  ),
  title: {
    default: "Infernet Protocol — Decentralized GPU inference",
    template: "%s · Infernet Protocol"
  },
  description:
    "A peer-to-peer GPU inference marketplace. Run one CLI command, point it at any model you have hardware for, and start earning crypto. No native token, no rent extraction.",
  openGraph: {
    title: "Infernet Protocol — Bitcoin for AI inference",
    description:
      "Decentralized GPU compute. Operators earn crypto for the GPUs they already have; clients pay in any supported coin.",
    type: "website",
    siteName: "Infernet Protocol"
  },
  twitter: {
    card: "summary_large_image",
    title: "Infernet Protocol — Bitcoin for AI inference",
    description:
      "Decentralized GPU compute. No native token, no rent extraction, no permission required."
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
