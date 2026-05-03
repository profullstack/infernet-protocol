/**
 * Real-Hyperswarm integration test for IPIP-0032. The unit tests use
 * a FakeSwarm + a duplex pair, which proves the handshake state
 * machine but not that the actual library does what we think it
 * does. This test spins up an in-process hyperdht testnet, points
 * two real Hyperswarm-backed DiscoveryNodes at it, and verifies
 * they find each other on a shared topic and exchange verified
 * handshakes — end to end, no fakes.
 *
 * Skipped by default: Hyperswarm relies on UDP hole-punching which
 * sandboxed CI runners (and our local dev sandbox) often disallow,
 * so the test would falsely fail in those environments. Run on a
 * real Linux host with:
 *
 *     INFERNET_RUN_INTEGRATION=1 npx vitest run tests/discovery-integration.test.js
 *
 * Expected wall time: ~5–30s (hyperdht's announce + lookup +
 * connection cycle).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { generateKeyPair } from '@infernetprotocol/auth';
import { createDiscoveryNode } from '../packages/discovery/src/node.js';

const SKIP = process.env.INFERNET_RUN_INTEGRATION !== '1';
const itIfEnabled = SKIP ? it.skip : it;

/**
 * Minimal in-process hyperdht testnet — three local DHT nodes
 * boostrapping off the first one. Replicates hyperdht/testnet.js
 * without depending on its (non-exported) module path.
 */
let testnetReady = null;
async function startTestnet() {
    if (!testnetReady) {
        testnetReady = (async () => {
            const DHT = (await import('hyperdht')).default;
            const first = new DHT({
                ephemeral: false,
                firewalled: false,
                bootstrap: [],
                host: '127.0.0.1'
            });
            await first.fullyBootstrapped();
            const bootstrap = [{ host: '127.0.0.1', port: first.address().port }];
            const nodes = [first];
            for (let i = 0; i < 9; i += 1) {
                const node = new DHT({
                    ephemeral: false,
                    firewalled: false,
                    bootstrap,
                    host: '127.0.0.1'
                });
                await node.fullyBootstrapped();
                nodes.push(node);
            }
            return {
                bootstrap,
                destroy: async () => {
                    for (let i = nodes.length - 1; i >= 0; i -= 1) {
                        try { await nodes[i].destroy(); } catch { /* ignore */ }
                    }
                }
            };
        })();
    }
    return testnetReady;
}

describe('DiscoveryNode integration — real Hyperswarm', () => {
    itIfEnabled(
        'two nodes find each other on a shared topic and exchange verified handshakes',
        async () => {
            const testnet = await startTestnet();
            const bootstrap = testnet.bootstrap;

            const aKeys = generateKeyPair();
            const bKeys = generateKeyPair();

            const a = await createDiscoveryNode({
                privateKey: aKeys.privateKey,
                publicKey: aKeys.publicKey,
                advertise: true,
                address: '127.0.0.1:46337',
                topics: [{ kind: 'rpc', value: 'qwen2.5:72b' }],
                swarmOptions: { bootstrap }
            });
            const b = await createDiscoveryNode({
                privateKey: bKeys.privateKey,
                publicKey: bKeys.publicKey,
                advertise: true,
                address: '127.0.0.1:46338',
                topics: [{ kind: 'rpc', value: 'qwen2.5:72b' }],
                swarmOptions: { bootstrap }
            });

            try {
                const seenA = new Promise((resolve, reject) => {
                    a.once('peer', resolve);
                    a.once('handshake-failed', (e) =>
                        reject(new Error(`a handshake-failed: ${e?.error?.message ?? e?.error}`))
                    );
                });
                const seenB = new Promise((resolve, reject) => {
                    b.once('peer', resolve);
                    b.once('handshake-failed', (e) =>
                        reject(new Error(`b handshake-failed: ${e?.error?.message ?? e?.error}`))
                    );
                });

                // Hyperswarm's flushed() resolves when our announce has
                // landed on the DHT — without it the discovery race wins
                // sometimes and the two peers never see each other.
                await Promise.all([
                    a._swarm.flush?.(),
                    b._swarm.flush?.()
                ]);

                const [peerOnA, peerOnB] = await Promise.all([seenA, seenB]);
                expect(peerOnA.peer.pubkey).toBe(bKeys.publicKey.toLowerCase());
                expect(peerOnB.peer.pubkey).toBe(aKeys.publicKey.toLowerCase());
                expect(peerOnA.peer.topics).toContain('rpc:qwen2.5:72b');
                expect(peerOnB.peer.topics).toContain('rpc:qwen2.5:72b');

                // peersOnTopic() index must be populated by the
                // handshake path, not just by the 'peer' event handler.
                const fromA = a.peersOnTopic('rpc', 'qwen2.5:72b');
                const fromB = b.peersOnTopic('rpc', 'qwen2.5:72b');
                expect(fromA.map((p) => p.pubkey)).toContain(bKeys.publicKey.toLowerCase());
                expect(fromB.map((p) => p.pubkey)).toContain(aKeys.publicKey.toLowerCase());
            } finally {
                await a.destroy();
                await b.destroy();
            }
        },
        60_000
    );

    itIfEnabled(
        'a node that joins a different topic does not appear in peersOnTopic',
        async () => {
            const testnet = await startTestnet();
            const bootstrap = testnet.bootstrap;

            const aKeys = generateKeyPair();
            const cKeys = generateKeyPair();

            const a = await createDiscoveryNode({
                privateKey: aKeys.privateKey,
                publicKey: aKeys.publicKey,
                advertise: true,
                address: '127.0.0.1:46339',
                topics: [{ kind: 'rpc', value: 'topic-X' }],
                swarmOptions: { bootstrap }
            });
            const c = await createDiscoveryNode({
                privateKey: cKeys.privateKey,
                publicKey: cKeys.publicKey,
                advertise: true,
                address: '127.0.0.1:46340',
                topics: [{ kind: 'rpc', value: 'topic-Y' }],
                swarmOptions: { bootstrap }
            });

            try {
                await Promise.all([a._swarm.flush?.(), c._swarm.flush?.()]);
                // Give the DHT a couple of seconds to confirm there's no
                // spurious match — disjoint topics MUST NOT discover each
                // other.
                await new Promise((r) => setTimeout(r, 2000));
                expect(a.peersOnTopic('rpc', 'topic-X')).toEqual([]);
                expect(c.peersOnTopic('rpc', 'topic-Y')).toEqual([]);
            } finally {
                await a.destroy();
                await c.destroy();
            }
        },
        20_000
    );

    // After the suite, tear down the shared testnet. Hyperswarm
    // leaves open UDP sockets otherwise and vitest hangs on exit.
    afterAll(async () => {
        if (testnetReady) {
            const t = await testnetReady.catch(() => null);
            if (t) await t.destroy();
        }
    });
});
