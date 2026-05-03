import { describe, expect, it } from 'vitest';
import { EventEmitter, Duplex, PassThrough } from 'node:stream';
import { generateKeyPair } from '@infernetprotocol/auth';
import { createDiscoveryNode } from '../packages/discovery/src/node.js';
import { buildHandshake } from '../packages/discovery/src/handshake.js';
import { topicKey } from '../packages/discovery/src/topic.js';

class FakeSwarm extends EventEmitter {
    constructor() {
        super();
        this.joined = new Map();
        this.left = [];
        this.flushCount = 0;
        this.destroyed = false;
    }
    join(key, opts) { this.joined.set(hex(key), { opts }); }
    leave(key) {
        this.left.push(hex(key));
        this.joined.delete(hex(key));
    }
    flush() { this.flushCount += 1; return Promise.resolve(); }
    destroy() { this.destroyed = true; return Promise.resolve(); }
}

function hex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
    return out;
}

/**
 * Connected duplex pair: writes to A surface as `data` events on B
 * and vice-versa, with no piping loop. Mirrors the Hyperswarm peer
 * stream contract closely enough to exercise the handshake.
 */
function pair() {
    const aToB = new PassThrough();
    const bToA = new PassThrough();

    const a = new Duplex({
        write(chunk, enc, cb) { aToB.write(chunk, enc, cb); },
        read() {} // pushed externally
    });
    const b = new Duplex({
        write(chunk, enc, cb) { bToA.write(chunk, enc, cb); },
        read() {}
    });
    aToB.on('data', (d) => b.push(d));
    bToA.on('data', (d) => a.push(d));

    return [a, b];
}

describe('createDiscoveryNode — IPIP-0032 §5-6', () => {
    it('joins the requested topics with server: true when advertising', async () => {
        const keys = generateKeyPair();
        const swarm = new FakeSwarm();
        const node = await createDiscoveryNode({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            address: '203.0.113.7:46337',
            topics: [{ kind: 'class', value: 'B' }, { kind: 'model', value: 'qwen2.5:7b' }],
            swarmFactory: () => swarm
        });

        const classKey = hex(topicKey('class', 'B'));
        const modelKey = hex(topicKey('model', 'qwen2.5:7b'));
        expect(swarm.joined.get(classKey).opts).toEqual({ server: true, client: true });
        expect(swarm.joined.get(modelKey).opts).toEqual({ server: true, client: true });
        await node.destroy();
    });

    it('joins client-only when advertise=false (private mode)', async () => {
        const keys = generateKeyPair();
        const swarm = new FakeSwarm();
        const node = await createDiscoveryNode({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            advertise: false,
            address: '203.0.113.7:46337',
            topics: [{ kind: 'class', value: 'B' }],
            swarmFactory: () => swarm
        });

        const k = hex(topicKey('class', 'B'));
        expect(swarm.joined.get(k).opts).toEqual({ server: false, client: true });
        await node.destroy();
    });

    it('setTopics() diffs the joined set instead of churning every entry', async () => {
        const keys = generateKeyPair();
        const swarm = new FakeSwarm();
        const node = await createDiscoveryNode({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: [{ kind: 'class', value: 'B' }, { kind: 'model', value: 'qwen2.5:7b' }],
            swarmFactory: () => swarm
        });
        const before = new Set(swarm.joined.keys());

        node.setTopics([
            { kind: 'class', value: 'B' },                  // unchanged
            { kind: 'model', value: 'qwen2.5:14b' }        // replaces 7b
        ]);

        // qwen2.5:7b leaves; qwen2.5:14b joins. class:B must remain.
        expect(swarm.left).toContain(hex(topicKey('model', 'qwen2.5:7b')));
        expect(swarm.joined.has(hex(topicKey('class', 'B')))).toBe(true);
        expect(swarm.joined.has(hex(topicKey('model', 'qwen2.5:14b')))).toBe(true);
        expect(swarm.joined.has(hex(topicKey('model', 'qwen2.5:7b')))).toBe(false);

        // Sanity: no spurious leave for class:B (it was already joined).
        expect(swarm.left).not.toContain(hex(topicKey('class', 'B')));
        // The set actually changed.
        expect(new Set(swarm.joined.keys())).not.toEqual(before);
        await node.destroy();
    });

    it('handshakes with a peer over a duplex stream and emits a verified peer event', async () => {
        const localKeys = generateKeyPair();
        const remoteKeys = generateKeyPair();
        const swarm = new FakeSwarm();

        const node = await createDiscoveryNode({
            privateKey: localKeys.privateKey,
            publicKey: localKeys.publicKey,
            address: '203.0.113.7:46337',
            topics: [{ kind: 'class', value: 'B' }],
            swarmFactory: () => swarm
        });

        const peerEvent = new Promise((resolve) => node.once('peer', resolve));
        const [localStream, remoteStream] = pair();

        // Simulate Hyperswarm handing the local node an incoming connection.
        swarm.emit('connection', localStream, { client: false });

        // Remote side: send its own signed handshake. The local node's
        // _onConnection writes its handshake automatically; we just need
        // the remote frame to land on localStream's inbound side.
        const { frame } = buildHandshake({
            privateKey: remoteKeys.privateKey,
            publicKey: remoteKeys.publicKey,
            topics: ['class:B'],
            address: '198.51.100.42:46337'
        });
        remoteStream.write(frame);

        const result = await peerEvent;
        expect(result.peer.pubkey).toBe(remoteKeys.publicKey.toLowerCase());
        expect(result.peer.topics).toContain('class:B');
        expect(result.peer.address).toBe('198.51.100.42:46337');

        await node.destroy();
    });

    it('records verified peers in peersOnTopic() after a successful handshake', async () => {
        const localKeys = generateKeyPair();
        const remoteA = generateKeyPair();
        const remoteB = generateKeyPair();
        const swarm = new FakeSwarm();
        const node = await createDiscoveryNode({
            privateKey: localKeys.privateKey,
            publicKey: localKeys.publicKey,
            address: '203.0.113.7:46337',
            topics: [{ kind: 'rpc', value: 'qwen2.5:72b' }],
            swarmFactory: () => swarm
        });

        // Two remote peers — A is on rpc:qwen2.5:72b; B is on a different topic.
        async function dialPeer(remoteKeys, topics) {
            const seenPeer = new Promise((resolve) => node.once('peer', resolve));
            const [localStream, remoteStream] = pair();
            swarm.emit('connection', localStream, { client: false });
            const { frame } = buildHandshake({
                privateKey: remoteKeys.privateKey,
                publicKey: remoteKeys.publicKey,
                topics
            });
            remoteStream.write(frame);
            await seenPeer;
            return { localStream, remoteStream };
        }

        await dialPeer(remoteA, ['rpc:qwen2.5:72b', 'class:B5']);
        await dialPeer(remoteB, ['model:llama3:8b']);

        const onTopic = node.peersOnTopic('rpc', 'qwen2.5:72b');
        expect(onTopic.map((p) => p.pubkey).sort()).toEqual([remoteA.publicKey.toLowerCase()].sort());
        expect(node.verifiedPeers().map((p) => p.pubkey).sort())
            .toEqual([remoteA.publicKey.toLowerCase(), remoteB.publicKey.toLowerCase()].sort());

        await node.destroy();
    });

    it('drops a peer from peersOnTopic when its stream closes', async () => {
        const localKeys = generateKeyPair();
        const remoteKeys = generateKeyPair();
        const swarm = new FakeSwarm();
        const node = await createDiscoveryNode({
            privateKey: localKeys.privateKey,
            publicKey: localKeys.publicKey,
            address: '203.0.113.7:46337',
            topics: [{ kind: 'rpc', value: 'qwen2.5:72b' }],
            swarmFactory: () => swarm
        });

        const seenPeer = new Promise((resolve) => node.once('peer', resolve));
        const [localStream, remoteStream] = pair();
        swarm.emit('connection', localStream, { client: false });
        const { frame } = buildHandshake({
            privateKey: remoteKeys.privateKey,
            publicKey: remoteKeys.publicKey,
            topics: ['rpc:qwen2.5:72b']
        });
        remoteStream.write(frame);
        await seenPeer;

        expect(node.peersOnTopic('rpc', 'qwen2.5:72b')).toHaveLength(1);

        // Simulate stream close — peer should drop out of the live set.
        localStream.emit('close');
        expect(node.peersOnTopic('rpc', 'qwen2.5:72b')).toHaveLength(0);
        // ...but verifiedPeers() also filters on connected, so it's empty too.
        expect(node.verifiedPeers()).toHaveLength(0);

        await node.destroy();
    });

    it('emits handshake-failed on bad signature', async () => {
        const localKeys = generateKeyPair();
        const remoteKeys = generateKeyPair();
        const swarm = new FakeSwarm();

        const node = await createDiscoveryNode({
            privateKey: localKeys.privateKey,
            publicKey: localKeys.publicKey,
            address: null,
            advertise: false,
            topics: [],
            swarmFactory: () => swarm
        });

        const failed = new Promise((resolve) => node.once('handshake-failed', resolve));
        const [localStream, remoteStream] = pair();
        swarm.emit('connection', localStream, { client: true });

        const { frame } = buildHandshake({
            privateKey: remoteKeys.privateKey,
            publicKey: remoteKeys.publicKey,
            topics: ['class:B']
        });
        // Corrupt the topics field after the sig was computed.
        const tampered = frame.replace('class:B', 'class:C');
        remoteStream.write(tampered);

        const evt = await failed;
        expect(evt.error).toBeInstanceOf(Error);
        expect(evt.error.message).toMatch(/signature verification failed|handshake/);

        await node.destroy();
    });
});
