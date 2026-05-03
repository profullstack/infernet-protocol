/**
 * `infernet rpc` — operator-side diagnostics for IPIP-0033 federated
 * inference. Today only one subcommand:
 *
 *   infernet rpc census --model <id>
 *       Asks THIS daemon's HTTP /v1/rpc/census endpoint for the set
 *       of peers it sees on the rpc:<model> Hyperswarm topic. The
 *       answer is a second opinion to the control-plane census —
 *       useful when the providers table looks stale, or to confirm
 *       the DHT is actually finding anyone.
 *
 * Why this isn't fetching from the public control plane: per IPIP-0032,
 * the control plane MUST NOT itself join the DHT. The daemon is the
 * canonical DHT view; the control-plane census reflects heartbeats
 * only.
 */

const HELP = `infernet rpc — federated-inference diagnostics

Usage:
  infernet rpc census --model <id> [--kind rpc|model|class]
                                   [--daemon http://host:port]

Flags:
  --model <id>     Required. Canonical model id (e.g. qwen2.5:72b).
  --kind <ns>      Topic namespace (default: rpc; see IPIP-0032 §3).
  --daemon <url>   Daemon HTTP base. Defaults to http://127.0.0.1:8080,
                   matching the local daemon's healthz port. Set this
                   to query a peer's daemon directly.

Examples:
  # What does my daemon see on rpc:qwen2.5:72b right now?
  infernet rpc census --model qwen2.5:72b

  # Same query against a remote daemon's HTTP surface.
  infernet rpc census --model qwen2.5:72b --daemon http://10.0.0.7:8080
`;

const DEFAULT_DAEMON = 'http://127.0.0.1:8080';

async function cmdCensus(args) {
    const model = args.get('model');
    if (!model) {
        process.stderr.write('error: --model <id> is required\n');
        return 2;
    }
    const kind = args.get('kind') ?? 'rpc';
    const daemon = (args.get('daemon') ?? DEFAULT_DAEMON).replace(/\/+$/, '');
    const qs = new URLSearchParams({ model, kind }).toString();
    const url = `${daemon}/v1/rpc/census?${qs}`;

    let res;
    try {
        res = await fetch(url);
    } catch (err) {
        process.stderr.write(
            `error: could not reach daemon at ${daemon}: ${err?.message ?? err}\n` +
            `       is the daemon running? (\`infernet status\` to check)\n`
        );
        return 1;
    }
    if (!res.ok) {
        process.stderr.write(`error: HTTP ${res.status} from ${url}\n`);
        try {
            const text = await res.text();
            if (text) process.stderr.write(`  body: ${text}\n`);
        } catch { /* ignore */ }
        return 1;
    }

    const body = await res.json();
    if (body?.dht === false) {
        process.stdout.write(
            `(this daemon has DHT discovery disabled — start it without --no-dht ` +
            `or unset INFERNET_DISABLE_DHT to enable.)\n`
        );
        return 0;
    }

    const peers = Array.isArray(body?.peers) ? body.peers : [];
    process.stdout.write(`\n${kind}:${model} — ${body.count ?? peers.length} peer(s) live in this daemon's DHT view\n`);
    if (peers.length === 0) {
        process.stdout.write(
            `  No one else on the topic. Check \`infernet status\` to confirm\n` +
            `  the daemon's DHT is up, and ask another operator to run\n` +
            `  \`infernet inference serve --backend rpc --model ${model}\`.\n\n`
        );
        return 0;
    }

    process.stdout.write(`\n  ${'PUBKEY'.padEnd(18)}  ${'ADDRESS'.padEnd(24)}  LAST SEEN\n`);
    process.stdout.write(`  ${'──────'.padEnd(18)}  ${'───────'.padEnd(24)}  ─────────\n`);
    for (const p of peers) {
        const pk = (p.pubkey ?? '').slice(0, 12) + '…';
        const addr = p.address ?? '(private)';
        const last = p.last_seen ? relativeAgo(p.last_seen) : '—';
        process.stdout.write(`  ${pk.padEnd(18)}  ${String(addr).padEnd(24)}  ${last}\n`);
    }
    if (body?.self?.pubkey) {
        process.stdout.write(`\n  (this daemon: ${body.self.pubkey.slice(0, 12)}… — topics: ${body.self.topics?.join(', ') ?? 'none'})\n\n`);
    } else {
        process.stdout.write('\n');
    }
    return 0;
}

function relativeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return iso;
    const s = Math.floor(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

export default async function rpc(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }
    const sub = args.positional?.[0];
    switch (sub) {
        case 'census': return cmdCensus(args);
        default:
            process.stderr.write(sub ? `unknown subcommand: ${sub}\n\n` : 'error: missing subcommand\n\n');
            process.stderr.write(HELP);
            return 2;
    }
}

export { HELP };
