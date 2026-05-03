/**
 * IPIP-0032 §5-7 — Hyperswarm wrapper for an Infernet daemon.
 *
 * createDiscoveryNode() owns one Hyperswarm instance and:
 *   - announces on per-served-model + per-class + per-pubkey topics
 *   - runs the IPIP-0032 §4 handshake on every incoming connection
 *   - emits 'peer' events with the verified pubkey + the raw stream
 *
 * Operators with INFERNET_PUBLIC=0 (or providers.is_public=false) join
 * topics with `server: false` — they can dial out, but they don't
 * announce a routable address and won't accept inbound connections.
 *
 * The Hyperswarm import is dynamic so this package can be imported in
 * environments where the dep is absent (tests that don't touch the
 * network, the control plane, etc.).
 */
import { EventEmitter } from 'node:events';
import { topicKey } from './topic.js';
import { buildHandshake, verifyHandshake } from './handshake.js';

const RE_ANNOUNCE_MS = 10 * 60 * 1000; // §7
const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * @param {Object} args
 * @param {string} args.privateKey  64-char hex
 * @param {string} args.publicKey   64-char hex (x-only)
 * @param {boolean} [args.advertise=true]  False → join client-only (no announce).
 * @param {string|null} [args.address]     "host:port" or null when private.
 * @param {Array<{kind:string, value:string}>} [args.topics=[]]
 * @param {Object} [args.swarmOptions]     Forwarded to Hyperswarm.
 * @param {Function} [args.swarmFactory]   Test seam — returns the swarm.
 * @returns {Promise<DiscoveryNode>}
 */
export async function createDiscoveryNode(args) {
    const {
        privateKey,
        publicKey,
        advertise = true,
        address = null,
        topics = [],
        swarmOptions = {},
        swarmFactory
    } = args ?? {};
    if (!privateKey || !publicKey) {
        throw new Error('createDiscoveryNode requires privateKey + publicKey');
    }

    const swarm = swarmFactory
        ? await swarmFactory(swarmOptions)
        : await defaultSwarmFactory(swarmOptions);

    const node = new DiscoveryNode({
        swarm,
        privateKey,
        publicKey,
        advertise,
        address: advertise ? address : null
    });

    // Initial topic set — caller can join more after start.
    for (const t of topics) node.join(t.kind, t.value);

    return node;
}

class DiscoveryNode extends EventEmitter {
    constructor({ swarm, privateKey, publicKey, advertise, address }) {
        super();
        this._swarm = swarm;
        this._privateKey = privateKey;
        this._publicKey = publicKey.toLowerCase();
        this._advertise = advertise;
        this._address = address;
        this._joined = new Map(); // hex(topic) -> { kind, value, key }
        // Verified peer registry — populated by the handshake. The
        // value is the most recent verified payload from that pubkey
        // plus connection bookkeeping. peersOnTopic() reads from here.
        // pubkey (lowercase hex) -> {
        //   pubkey, topics, address, firstSeen, lastSeen, connected
        // }
        this._verifiedPeers = new Map();
        this._reannounceTimer = null;
        this._destroyed = false;

        if (typeof swarm.on === 'function') {
            swarm.on('connection', (stream, info) => this._onConnection(stream, info));
        }

        this._reannounceTimer = setInterval(() => this._reannounce(), RE_ANNOUNCE_MS);
        if (typeof this._reannounceTimer.unref === 'function') this._reannounceTimer.unref();
    }

    get pubkey() { return this._publicKey; }
    get isAdvertising() { return this._advertise; }
    get topics() { return [...this._joined.values()].map((t) => `${t.kind}:${t.value}`); }

    /**
     * Snapshot of every currently-connected verified peer. Each entry
     * matches what the peer sent in its handshake, plus our local
     * bookkeeping (firstSeen, lastSeen, connected).
     */
    verifiedPeers() {
        return [...this._verifiedPeers.values()].filter((p) => p.connected);
    }

    /**
     * Subset of verifiedPeers() that advertise the given (kind, value)
     * topic. Used by the daemon's /v1/rpc/census endpoint and the CLI
     * diagnostic to answer "who else is on this topic right now?"
     */
    peersOnTopic(kind, value) {
        const wanted = `${kind}:${value}`;
        return this.verifiedPeers().filter((p) => Array.isArray(p.topics) && p.topics.includes(wanted));
    }

    /** Join a topic. Idempotent. */
    join(kind, value) {
        const key = topicKey(kind, value);
        const hex = bytesToHex(key);
        if (this._joined.has(hex)) return;
        this._joined.set(hex, { kind, value, key });

        // server: announce + accept; client: lookup. Private nodes are
        // client-only.
        const opts = this._advertise
            ? { server: true, client: true }
            : { server: false, client: true };
        if (typeof this._swarm.join === 'function') this._swarm.join(key, opts);
    }

    /** Leave a topic. */
    leave(kind, value) {
        const key = topicKey(kind, value);
        const hex = bytesToHex(key);
        if (!this._joined.has(hex)) return;
        this._joined.delete(hex);
        if (typeof this._swarm.leave === 'function') this._swarm.leave(key);
    }

    /**
     * Replace the joined topic set in one shot — used when the
     * served-models list changes. Diffs against the current set so we
     * don't churn the DHT for stable entries.
     */
    setTopics(next) {
        const wanted = new Map();
        for (const t of next) {
            const key = topicKey(t.kind, t.value);
            wanted.set(bytesToHex(key), t);
        }
        // Drop topics no longer wanted.
        for (const [hex, t] of this._joined) {
            if (!wanted.has(hex)) this.leave(t.kind, t.value);
        }
        // Add new ones.
        for (const [hex, t] of wanted) {
            if (!this._joined.has(hex)) this.join(t.kind, t.value);
        }
    }

    async destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        clearInterval(this._reannounceTimer);
        this._joined.clear();
        if (typeof this._swarm.destroy === 'function') {
            await this._swarm.destroy();
        }
    }

    /**
     * Send our handshake first, wait for theirs, verify, register the
     * peer in the verified-peer index, and emit a 'peer' event with
     * the verified payload + the underlying stream. Drop the
     * connection on any error.
     */
    async _onConnection(stream, info) {
        try {
            const { frame } = buildHandshake({
                privateKey: this._privateKey,
                publicKey: this._publicKey,
                topics: this.topics,
                address: this._address
            });
            try { stream.write(frame); } catch { /* peer hung up */ }

            const remoteFrame = await readHandshakeFrame(stream, HANDSHAKE_TIMEOUT_MS);
            const verified = verifyHandshake(remoteFrame);

            this._registerVerifiedPeer(verified);
            const cleanup = () => this._unregisterVerifiedPeer(verified.pubkey);
            stream.once?.('close', cleanup);
            stream.once?.('end', cleanup);
            stream.once?.('error', cleanup);

            this.emit('peer', { stream, info, peer: verified });
        } catch (err) {
            try { stream.destroy(); } catch { /* ignore */ }
            this.emit('handshake-failed', { error: err, info });
        }
    }

    _registerVerifiedPeer(verified) {
        const now = Date.now();
        const key = verified.pubkey?.toLowerCase();
        if (!key) return;
        const prev = this._verifiedPeers.get(key);
        this._verifiedPeers.set(key, {
            pubkey: key,
            topics: Array.isArray(verified.topics) ? verified.topics.slice() : [],
            address: verified.address ?? null,
            firstSeen: prev?.firstSeen ?? now,
            lastSeen: now,
            connected: true
        });
    }

    _unregisterVerifiedPeer(pubkey) {
        const key = (pubkey ?? '').toLowerCase();
        const cur = this._verifiedPeers.get(key);
        if (!cur) return;
        // Mark disconnected but retain the record briefly so a flapping
        // peer that reconnects within seconds doesn't lose its
        // firstSeen timestamp.
        this._verifiedPeers.set(key, { ...cur, connected: false, lastSeen: Date.now() });
    }

    _reannounce() {
        if (this._destroyed) return;
        if (typeof this._swarm.flush !== 'function') return;
        this._swarm.flush().catch(() => { /* best-effort */ });
    }
}

async function defaultSwarmFactory(options) {
    const mod = await import('hyperswarm');
    const Hyperswarm = mod.default ?? mod;
    return new Hyperswarm(options);
}

/**
 * Read one `INFERNET-HELLO\n<json>\n` frame from a duplex stream.
 *
 * Bounded by `timeoutMs`; throws on timeout or premature end. Reads
 * are chunk-defensive — Hyperswarm hands us a Node duplex, but the
 * peer's send may arrive in arbitrarily-sized pieces.
 */
export function readHandshakeFrame(stream, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buf = '';
        const decoder = new TextDecoder();
        let settled = false;
        const settle = (fn, val) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn(val);
        };

        const onData = (chunk) => {
            buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
            // Two newlines: one after INFERNET-HELLO, one after JSON.
            const end = nthIndexOf(buf, '\n', 2);
            if (end >= 0) settle(resolve, buf.slice(0, end + 1));
        };
        const onError = (err) => settle(reject, err);
        const onEnd = () => settle(reject, new Error('stream ended before handshake'));

        const timer = setTimeout(
            () => settle(reject, new Error(`handshake timed out after ${timeoutMs}ms`)),
            timeoutMs
        );
        if (typeof timer.unref === 'function') timer.unref();

        function cleanup() {
            clearTimeout(timer);
            stream.removeListener?.('data', onData);
            stream.removeListener?.('error', onError);
            stream.removeListener?.('end', onEnd);
        }

        stream.on?.('data', onData);
        stream.on?.('error', onError);
        stream.on?.('end', onEnd);
    });
}

function nthIndexOf(s, ch, n) {
    let from = 0;
    for (let i = 0; i < n; i += 1) {
        const idx = s.indexOf(ch, from);
        if (idx < 0) return -1;
        from = idx + 1;
        if (i === n - 1) return idx;
    }
    return -1;
}

function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}
