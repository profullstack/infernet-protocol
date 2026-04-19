/**
 * Canonical Infernet platform deposit addresses — the single source of truth.
 *
 * These are the wallets the platform receives inference payments into.
 * They are mirrored into Supabase by the `platform_wallets` migration seed
 * so both the CLI (which imports this module) and the web app (which reads
 * the table) stay in sync.
 *
 * DO NOT modify without direct instruction — these are treasury addresses.
 */

export const DEPOSIT_ADDRESSES = [
  { coin: "BTC",  network: "bitcoin",      address: "1HvEHWHAYW53cP6aQxWEcNaPb35sZZKFwF",                                     label: "treasury-1"    },
  { coin: "BTC",  network: "bitcoin",      address: "17xz382FDrKZj25aFkkc5CZuFpQcbFAgur",                                     label: "treasury-2"    },
  { coin: "BTC",  network: "bitcoin",      address: "1GTB6S6UGn9rkrKSTGpcEhpHi8SzXzWx6q",                                     label: "treasury-3"    },
  { coin: "ETH",  network: "ethereum",     address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "treasury-1"    },
  { coin: "ETH",  network: "ethereum",     address: "0xdDeef601c86C651DD20d6EE3FE4318fC4343D95f",                             label: "treasury-2"    },
  { coin: "SOL",  network: "solana",       address: "B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr",                           label: "treasury-1"    },
  { coin: "SOL",  network: "solana",       address: "7tKgJsSWPQGKk3wSijwbLf4qL8Tno4GPXrwGvkmiz39g",                           label: "treasury-2"    },
  { coin: "POL",  network: "polygon",      address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "treasury-1"    },
  { coin: "BCH",  network: "bitcoin-cash", address: "bitcoincash:qryu0va3022eafyv6dhmdd7kylxszm5myqncfxjkaj",                 label: "treasury-1"    },
  { coin: "BCH",  network: "bitcoin-cash", address: "bitcoincash:qpw9mk5gmalaj9mjnndjkyenjz3rxgtt8grllxcmvd",                 label: "treasury-2"    },
  { coin: "BCH",  network: "bitcoin-cash", address: "bitcoincash:qqppxsqwekrpsn5lk56sjjpvhpv424zetudh8szzx7",                 label: "treasury-3"    },
  { coin: "DOGE", network: "dogecoin",     address: "DPsNhvoJT5h7FGyh9uiWLeFJLsyLh7f3Wf",                                     label: "treasury-1"    },
  { coin: "DOGE", network: "dogecoin",     address: "DSKkQtcPirS2H5kGyc5pU8PHSVqx6DdUyV",                                     label: "treasury-2"    },
  { coin: "XRP",  network: "ripple",       address: "r4MoVnbkHbeJGiDx7GyVCCCHyhSPoqXfHR",                                     label: "treasury-1"    },
  { coin: "XRP",  network: "ripple",       address: "rsmeBkmDYGPxtYmbad8iBxnikePABUEZJx",                                     label: "treasury-2"    },
  { coin: "XRP",  network: "ripple",       address: "rKduygNv5nAP9u7y952Fhs9EPHTzgHguUi",                                     label: "treasury-3"    },
  { coin: "ADA",  network: "cardano",      address: "addr1v9j4u56udhkav64gm9qrp48lsymvwu3qm649vq9s0hnmzrqumlavc",             label: "treasury-1"    },
  { coin: "ADA",  network: "cardano",      address: "addr1v9euqha76gav45zwne6tu06gdu9mf3c8hqxlnx07km6xfxc4u9pyl",             label: "treasury-2"    },
  { coin: "BNB",  network: "bsc",          address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "treasury-1"    },
  { coin: "USDT", network: "ethereum",     address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "usdt-erc20"    },
  { coin: "USDT", network: "polygon",      address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "usdt-polygon"  },
  { coin: "USDT", network: "solana",       address: "B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr",                           label: "usdt-spl"      },
  { coin: "USDC", network: "ethereum",     address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "usdc-erc20"    },
  { coin: "USDC", network: "polygon",      address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "usdc-polygon"  },
  { coin: "USDC", network: "solana",       address: "B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr",                           label: "usdc-spl"      },
  { coin: "USDC", network: "base",         address: "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5",                             label: "usdc-base"     }
];

export function getAddressesFor(coin, network) {
  const upper = String(coin).toUpperCase();
  return DEPOSIT_ADDRESSES.filter(
    (a) => a.coin === upper && (!network || a.network === network)
  );
}

export function pickAddress(coin, network) {
  const options = getAddressesFor(coin, network);
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}
