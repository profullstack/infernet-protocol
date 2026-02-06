import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infernet Protocol - Decentralized GPU Inference',
  description:
    'A peer-to-peer protocol for distributed GPU inference. Earn crypto by sharing compute or access distributed AI inference on demand.',
  keywords: ['GPU', 'inference', 'P2P', 'decentralized', 'AI', 'crypto', 'Bitcoin', 'Ethereum'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
