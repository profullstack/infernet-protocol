import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-6xl font-bold tracking-tight mb-6">
          Infernet <span className="text-infernet-600">Protocol</span>
        </h1>

        <p className="text-xl text-gray-600 dark:text-gray-400 mb-4 max-w-2xl mx-auto">
          A peer-to-peer protocol for distributed GPU inference.
          Earn crypto by sharing compute. Access AI inference on demand.
        </p>

        <p className="text-sm text-gray-500 dark:text-gray-500 mb-12">
          Powered by libp2p • Payments via BTC, ETH, SOL, POL, BCH, USDC
        </p>

        <div className="flex gap-4 justify-center mb-16">
          <Link
            href="/dashboard"
            className="px-8 py-3 bg-infernet-600 text-white rounded-lg font-medium hover:bg-infernet-700 transition-colors"
          >
            Launch Dashboard
          </Link>
          <a
            href="https://github.com/profullstack/infernet-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            GitHub
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">🖥️ Provide Compute</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Share idle GPU/CPU cycles and earn crypto. Set your own pricing,
              build reputation, and join specialized compute pools.
            </p>
          </div>

          <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">🤖 Run Inference</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Access distributed GPU power for AI inference. Pay only for what
              you use with instant crypto micropayments.
            </p>
          </div>

          <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">🔒 Trustless Escrow</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Funds held in escrow until compute is verified. No middlemen,
              no trust required. Powered by CoinPay.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
