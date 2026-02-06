import { createLibp2p, type Libp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import type { InfernetConfig } from '@infernet/shared';

const DEFAULT_BOOTSTRAP_PEERS = [
  // Infernet bootstrap nodes (Supabase-registered)
  // These will be fetched dynamically at startup
];

const DEFAULT_LISTEN_ADDRESSES_NODE = [
  '/ip4/0.0.0.0/tcp/0/ws',
  '/ip4/0.0.0.0/udp/0/webrtc-direct',
];

const DEFAULT_LISTEN_ADDRESSES_BROWSER = [
  '/webrtc',
];

export interface CreateNodeOptions {
  config: InfernetConfig;
  isServer?: boolean;
  isRelay?: boolean;
}

/**
 * Create a libp2p node configured for the Infernet Protocol.
 * Works in both Node.js and browser environments.
 */
export async function createInfernetNode(options: CreateNodeOptions): Promise<Libp2p> {
  const { config, isServer = false, isRelay = false } = options;

  const isBrowser = typeof window !== 'undefined';

  const listenAddresses = config.listenAddresses ?? (
    isBrowser ? DEFAULT_LISTEN_ADDRESSES_BROWSER : DEFAULT_LISTEN_ADDRESSES_NODE
  );

  // Fetch bootstrap peers from Supabase if configured
  let bootstrapPeers = config.bootstrapPeers ?? DEFAULT_BOOTSTRAP_PEERS;
  if (config.supabaseUrl && config.supabaseAnonKey && bootstrapPeers.length === 0) {
    bootstrapPeers = await fetchBootstrapPeers(config.supabaseUrl, config.supabaseAnonKey);
  }

  const transports = [
    webSockets(),
    webRTC(),
    circuitRelayTransport(),
  ];

  // Only add webtransport in browser if available
  // Note: webTransport support is still experimental in libp2p
  // Uncomment when stable:
  // if (isBrowser) {
  //   const { webTransport } = await import('@libp2p/webtransport');
  //   transports.push(webTransport());
  // }

  const services: Record<string, unknown> = {
    identify: identify(),
    dht: kadDHT({
      clientMode: !isServer,
    }),
  };

  // Relay servers help browser nodes connect to each other
  if (isRelay) {
    services.relay = circuitRelayServer();
  }

  const node = await createLibp2p({
    addresses: {
      listen: listenAddresses,
    },
    transports,
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: bootstrapPeers.length > 0
      ? [bootstrap({ list: bootstrapPeers })]
      : [],
    services,
  });

  return node;
}

/**
 * Fetch bootstrap peer multiaddrs from Supabase
 */
async function fetchBootstrapPeers(supabaseUrl: string, anonKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/bootstrap_nodes?select=multiaddr&active=eq.true`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });

    if (!res.ok) return [];

    const nodes: Array<{ multiaddr: string }> = await res.json();
    return nodes.map((n) => n.multiaddr);
  } catch {
    console.warn('[infernet] Failed to fetch bootstrap peers from Supabase');
    return [];
  }
}

export { type Libp2p };
