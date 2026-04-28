import { NextResponse } from "next/server";
import net from "node:net";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/probe?host=<ip-or-host>&port=<n>
 *
 * Public reachability probe. Daemons hit this on startup to find out
 * whether their advertised (address, port) actually accepts inbound
 * connections from the public Internet — the typical residential
 * router / NAT case answers "no" without explicit port forwarding.
 *
 * Result is reported back into specs.reachable on the next heartbeat
 * so the dashboard / matchmaker can distinguish:
 *   - reachable nodes  — fully P2P-capable, advertise-able to clients
 *     who want a direct connection
 *   - unreachable nodes — still get jobs via control-plane polling
 *     (daemon's outbound HTTP doesn't need inbound), but should NOT
 *     be advertised as a libp2p peer
 *
 * Why a server-side probe instead of the daemon checking itself:
 *   - the daemon's `detectLocalAddress()` returns whatever the host
 *     thinks its public IP is (icanhazip / hostname -I); that's the
 *     advertised address but doesn't prove inbound works
 *   - we're already a public service, so we're a natural reflector
 *
 * Heavily rate-limited (10/min/IP) — TCP connects are cheap but
 * we don't want this used as a generic port scanner.
 */
const limit = rateLimit({ windowMs: 60 * 1000, max: 10 });

const CONNECT_TIMEOUT_MS = 4000;
const ALLOWED_PORTS = { min: 1024, max: 65535 };

function err(status, message) {
    return NextResponse.json({ error: message }, { status });
}

function isPlausibleHost(host) {
    if (!host || typeof host !== "string" || host.length > 253) return false;
    // Reject obvious LAN / loopback / link-local destinations — we won't
    // probe those (and the result wouldn't be meaningful anyway).
    if (/^(127\.|10\.|192\.168\.|169\.254\.|::1|fe80:|fc00:)/i.test(host)) return false;
    if (host === "localhost") return false;
    // RFC1918 172.16/12 — match 172.16-172.31
    const m = host.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
    return true;
}

export async function GET(request) {
    const ip = getClientIp(request);
    const r = limit.check(ip);
    if (!r.ok) return err(429, "rate limited");

    const url = new URL(request.url);
    const host = url.searchParams.get("host");
    const portStr = url.searchParams.get("port");
    const port = Number.parseInt(portStr ?? "", 10);

    if (!isPlausibleHost(host)) {
        return err(400, "host required and must be a public address");
    }
    if (!Number.isFinite(port) || port < ALLOWED_PORTS.min || port > ALLOWED_PORTS.max) {
        return err(400, `port must be in [${ALLOWED_PORTS.min}, ${ALLOWED_PORTS.max}]`);
    }

    const t0 = Date.now();
    const result = await tryConnect(host, port, CONNECT_TIMEOUT_MS);
    const elapsed_ms = Date.now() - t0;

    return NextResponse.json({
        host,
        port,
        reachable: result.ok,
        elapsed_ms,
        ...(result.ok ? {} : { error: result.error })
    }, {
        headers: { "cache-control": "no-store" }
    });
}

function tryConnect(host, port, timeoutMs) {
    return new Promise((resolve) => {
        const sock = new net.Socket();
        let settled = false;
        const done = (verdict) => {
            if (settled) return;
            settled = true;
            try { sock.destroy(); } catch { /* ignore */ }
            resolve(verdict);
        };
        const timer = setTimeout(() => done({ ok: false, error: `timeout after ${timeoutMs}ms` }), timeoutMs);
        sock.setTimeout(timeoutMs);
        sock.once("connect", () => {
            clearTimeout(timer);
            done({ ok: true });
        });
        sock.once("error", (e) => {
            clearTimeout(timer);
            // Map common Node errors to a one-word verdict the operator
            // can act on.
            const code = e?.code;
            const msg =
                code === "ECONNREFUSED" ? "connection refused (service not listening on that port)" :
                code === "EHOSTUNREACH" ? "host unreachable (no route)" :
                code === "ENETUNREACH"  ? "network unreachable" :
                code === "ETIMEDOUT"    ? "timed out (firewall likely dropping)" :
                code === "ENOTFOUND"    ? "DNS lookup failed" :
                e?.message ?? String(e);
            done({ ok: false, error: msg });
        });
        sock.once("timeout", () => {
            clearTimeout(timer);
            done({ ok: false, error: "timed out (firewall likely dropping)" });
        });
        try {
            sock.connect({ host, port });
        } catch (e) {
            clearTimeout(timer);
            done({ ok: false, error: e?.message ?? String(e) });
        }
    });
}
