/**
 * Canonical list of cryptocurrencies accepted by Infernet for inference payments.
 *
 * The enabled coins here drive:
 *   - The web UI's "Pay with…" selector
 *   - Allowed `jobs.payment_coin` values
 *   - The provider payout picker
 *   - The CoinPayPortal integration (it will advertise these currencies)
 */

export const PAYMENT_COINS = [
  { code: "BTC",  name: "Bitcoin",                 network: "bitcoin",      stablecoin: false },
  { code: "BCH",  name: "Bitcoin Cash",            network: "bitcoin-cash", stablecoin: false },
  { code: "ETH",  name: "Ethereum",                network: "ethereum",     stablecoin: false },
  { code: "SOL",  name: "Solana",                  network: "solana",       stablecoin: false },
  { code: "POL",  name: "Polygon",                 network: "polygon",      stablecoin: false },
  { code: "BNB",  name: "BNB",                     network: "bsc",          stablecoin: false },
  { code: "XRP",  name: "XRP",                     network: "ripple",       stablecoin: false },
  { code: "ADA",  name: "Cardano",                 network: "cardano",      stablecoin: false },
  { code: "DOGE", name: "Dogecoin",                network: "dogecoin",     stablecoin: false },
  { code: "USDT", name: "Tether (USDT-ERC20)",     network: "ethereum",     stablecoin: true  },
  { code: "USDT", name: "Tether (USDT-Polygon)",   network: "polygon",      stablecoin: true  },
  { code: "USDT", name: "Tether (USDT-SPL)",       network: "solana",       stablecoin: true  },
  { code: "USDC", name: "USD Coin (USDC-ERC20)",   network: "ethereum",     stablecoin: true  },
  { code: "USDC", name: "USD Coin (USDC-Polygon)", network: "polygon",      stablecoin: true  },
  { code: "USDC", name: "USD Coin (USDC-SPL)",     network: "solana",       stablecoin: true  },
  { code: "USDC", name: "USD Coin (USDC-Base)",    network: "base",         stablecoin: true  }
];

export const PAYMENT_COIN_CODES = [...new Set(PAYMENT_COINS.map((c) => c.code))];

export function findCoin(code, network) {
  const upper = String(code).toUpperCase();
  return PAYMENT_COINS.find(
    (c) => c.code === upper && (!network || c.network === network)
  ) ?? null;
}
