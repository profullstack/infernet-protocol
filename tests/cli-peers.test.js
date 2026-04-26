import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let xdgSave;
let tmpHome;

beforeEach(() => {
    xdgSave = process.env.XDG_CONFIG_HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "infernet-peers-test-"));
    process.env.XDG_CONFIG_HOME = tmpHome;
});

afterEach(() => {
    if (xdgSave !== undefined) process.env.XDG_CONFIG_HOME = xdgSave;
    else delete process.env.XDG_CONFIG_HOME;
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const {
    fetchPeers,
    loadCachedPeers,
    saveCachedPeers,
    bootstrapPeers,
    getPeersCachePath
} = await import("../apps/cli/lib/peers.js");

function fakeFetchOk(payload) {
    return vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => payload
    }));
}

function fakeFetchFail(status) {
    return vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({})
    }));
}

function fakeFetchThrow(err = new Error("network down")) {
    return vi.fn(async () => { throw err; });
}

const SAMPLE_PEERS = [
    {
        pubkey: "5d0de683a5f22aa1d5a8927a431d86601277aad61fc7cdce126ac8c012e2c84d",
        multiaddr: "/ip4/162.250.189.114/tcp/46337",
        last_seen: "2026-04-26T12:00:00Z",
        served_models: ["qwen2.5:7b"],
        gpu_model: "A100"
    }
];

describe("fetchPeers", () => {
    it("calls /api/peers?limit=N with limit=20 by default", async () => {
        const fetchImpl = fakeFetchOk({ data: SAMPLE_PEERS });
        await fetchPeers("https://infernetprotocol.com", { fetchImpl });
        const url = new URL(fetchImpl.mock.calls[0][0]);
        expect(url.pathname).toBe("/api/peers");
        expect(url.searchParams.get("limit")).toBe("20");
    });

    it("honors a passed limit", async () => {
        const fetchImpl = fakeFetchOk({ data: SAMPLE_PEERS });
        await fetchPeers("https://infernetprotocol.com", { fetchImpl, limit: 5 });
        const url = new URL(fetchImpl.mock.calls[0][0]);
        expect(url.searchParams.get("limit")).toBe("5");
    });

    it("returns the data array from a successful response", async () => {
        const fetchImpl = fakeFetchOk({ data: SAMPLE_PEERS });
        const out = await fetchPeers("https://infernetprotocol.com", { fetchImpl });
        expect(out).toEqual(SAMPLE_PEERS);
    });

    it("throws on a non-2xx response", async () => {
        const fetchImpl = fakeFetchFail(503);
        await expect(
            fetchPeers("https://infernetprotocol.com", { fetchImpl })
        ).rejects.toThrow(/HTTP 503/);
    });

    it("throws on a malformed body", async () => {
        const fetchImpl = fakeFetchOk({ wrong: "shape" });
        await expect(
            fetchPeers("https://infernetprotocol.com", { fetchImpl })
        ).rejects.toThrow(/unexpected/);
    });

    it("throws on network failure", async () => {
        const fetchImpl = fakeFetchThrow();
        await expect(
            fetchPeers("https://infernetprotocol.com", { fetchImpl })
        ).rejects.toThrow(/network down/);
    });

    it("requires a seedNode", async () => {
        await expect(fetchPeers(null)).rejects.toThrow(/seedNode is required/);
    });
});

describe("peers cache", () => {
    it("returns null when no cache exists", async () => {
        expect(await loadCachedPeers()).toBeNull();
    });

    it("round-trips peers through save and load", async () => {
        await saveCachedPeers(SAMPLE_PEERS);
        const loaded = await loadCachedPeers();
        expect(loaded).toEqual(SAMPLE_PEERS);
    });

    it("writes the cache file with mode 0600", async () => {
        await saveCachedPeers(SAMPLE_PEERS);
        const fs = await import("node:fs/promises");
        const stat = await fs.stat(getPeersCachePath());
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it("returns null on garbage cache contents", async () => {
        const fs = await import("node:fs/promises");
        await saveCachedPeers([]);  // creates the dir + file
        await fs.writeFile(getPeersCachePath(), "{ not valid json", "utf8");
        expect(await loadCachedPeers()).toBeNull();
    });
});

describe("bootstrapPeers", () => {
    it("returns the first successful seed's response and caches it", async () => {
        const fetchImpl = fakeFetchOk({ data: SAMPLE_PEERS });
        const out = await bootstrapPeers({
            seedNodes: ["https://infernetprotocol.com"],
            fetchImpl
        });
        expect(out.source).toBe("fetch");
        expect(out.peers).toEqual(SAMPLE_PEERS);
        expect(out.seedNode).toBe("https://infernetprotocol.com");
        // Cache should now hold the same data.
        expect(await loadCachedPeers()).toEqual(SAMPLE_PEERS);
    });

    it("tries seed nodes in order, falling through on failure", async () => {
        let call = 0;
        const fetchImpl = vi.fn(async (url) => {
            call += 1;
            if (call === 1) throw new Error("first down");
            if (call === 2) return { ok: false, status: 502, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => ({ data: SAMPLE_PEERS }) };
        });
        const out = await bootstrapPeers({
            seedNodes: [
                "https://broken-1.example",
                "https://broken-2.example",
                "https://infernetprotocol.com"
            ],
            fetchImpl
        });
        expect(out.source).toBe("fetch");
        expect(out.seedNode).toBe("https://infernetprotocol.com");
        expect(call).toBe(3);
    });

    it("falls back to cache when every seed fails", async () => {
        await saveCachedPeers(SAMPLE_PEERS);
        const fetchImpl = fakeFetchThrow(new Error("offline"));
        const out = await bootstrapPeers({
            seedNodes: ["https://broken.example"],
            fetchImpl
        });
        expect(out.source).toBe("cache");
        expect(out.peers).toEqual(SAMPLE_PEERS);
        expect(out.errors).toHaveLength(1);
    });

    it("returns empty + errors when every seed fails AND cache is empty", async () => {
        const fetchImpl = fakeFetchThrow(new Error("offline"));
        const out = await bootstrapPeers({
            seedNodes: ["https://a.example", "https://b.example"],
            fetchImpl
        });
        expect(out.source).toBe("empty");
        expect(out.peers).toEqual([]);
        expect(out.errors).toHaveLength(2);
        expect(out.errors[0].seedNode).toBe("https://a.example");
        expect(out.errors[1].seedNode).toBe("https://b.example");
    });

    it("returns empty when no seed nodes are configured at all", async () => {
        const fetchImpl = vi.fn();
        const out = await bootstrapPeers({ seedNodes: [], fetchImpl });
        expect(out.source).toBe("empty");
        expect(out.peers).toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
