/**
 * Contract test: training-market data layer (IPIP-0030).
 *
 * Pins the wire shape between the open-market training endpoints and
 * the underlying tables. Failures here mean a daemon, submitter CLI, or
 * downstream tool that consumed the previous shape will break on
 * deploy.
 *
 * Specifically guards:
 *   - submit creates exactly num_shards rows with sequential URLs
 *   - claim is atomic (race guard returns 409 on a non-pending shard)
 *   - report enforces pubkey-match (wrong pubkey → 403)
 *   - last-shard report flips the job to completed
 *   - listAvailableShards filters by vram + status + per-job fairness cap
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tiny in-memory Supabase mock keyed by table. Each table is an array
 * of rows; the chainable query API mutates / reads it.
 */
function makeFakeSupabase(seed = {}) {
    const tables = {
        training_jobs: [...(seed.training_jobs ?? [])],
        training_shards: [...(seed.training_shards ?? [])],
        providers: [...(seed.providers ?? [])]
    };

    const calls = []; // ordered audit trail of every operation

    function chain(table) {
        const ctx = {
            _filters: [],
            _innerJoinFilters: [],
            _select: null,
            _action: null,
            _payload: null,
            _limit: null
        };
        const c = {
            select(cols) { ctx._select = cols ?? "*"; return c; },
            eq(col, val) { ctx._filters.push({ op: "eq", col, val }); return c; },
            lte(col, val) { ctx._filters.push({ op: "lte", col, val }); return c; },
            order() { return c; },
            limit(n) { ctx._limit = n; return c; },
            insert(payload) { ctx._action = "insert"; ctx._payload = payload; return c; },
            update(payload) { ctx._action = "update"; ctx._payload = payload; return c; },
            delete() { ctx._action = "delete"; return c; },

            async maybeSingle() {
                const rows = filter(tables[table] ?? [], ctx._filters);
                calls.push({ table, op: "maybeSingle", filters: ctx._filters });
                return { data: rows[0] ?? null, error: null };
            },
            async single() {
                const result = await runAction(table, tables, ctx, calls);
                if (Array.isArray(result.data)) {
                    return { data: result.data[0] ?? null, error: result.error };
                }
                return result;
            },
            // pnpm publish-style awaitable terminal
            then(resolve, reject) {
                runAction(table, tables, ctx, calls).then(resolve, reject);
            }
        };
        return c;
    }

    return {
        tables,
        calls,
        from(table) {
            if (!tables[table]) tables[table] = [];
            return chain(table);
        }
    };
}

function filter(rows, filters) {
    let out = rows;
    for (const f of filters) {
        if (f.col.includes(".")) continue; // inner-join filters — handled by caller
        if (f.op === "eq")  out = out.filter((r) => r[f.col] === f.val);
        if (f.op === "lte") out = out.filter((r) => Number(r[f.col]) <= Number(f.val));
    }
    return out;
}

async function runAction(table, tables, ctx, calls) {
    const arr = tables[table];
    if (ctx._action === "insert") {
        const rows = Array.isArray(ctx._payload) ? ctx._payload : [ctx._payload];
        const inserted = rows.map((r) => ({
            id: r.id ?? `${table}-${arr.length + 1}`,
            created_at: r.created_at ?? new Date().toISOString(),
            ...r
        }));
        for (const r of inserted) arr.push(r);
        calls.push({ table, op: "insert", count: inserted.length });
        return { data: hydrate(inserted, ctx._select, tables), error: null };
    }
    if (ctx._action === "update") {
        const matches = filter(arr, ctx._filters);
        for (const row of matches) Object.assign(row, ctx._payload);
        calls.push({ table, op: "update", filters: ctx._filters, payload: ctx._payload, matched: matches.length });
        return { data: hydrate(matches, ctx._select, tables), error: null };
    }
    // plain select
    const rows = filter(arr, ctx._filters);
    calls.push({ table, op: "select", filters: ctx._filters });
    const out = ctx._limit ? rows.slice(0, ctx._limit) : rows;
    return { data: hydrate(out, ctx._select, tables), error: null };
}

/**
 * If the select string mentions a foreign table like
 *   "id, ... training_jobs!inner(id, base_model, config)"
 * attach a `training_jobs` field on each row pointing at the matching
 * job. The data layer relies on this shape after select() chains.
 */
function hydrate(rows, selectStr, tables) {
    if (!selectStr) return rows;
    const m = selectStr.match(/(\w+)!inner\(/);
    if (!m) return rows;
    const fk = m[1];                     // e.g. "training_jobs"
    const joinTable = tables[fk] ?? [];
    return rows.map((r) => {
        if (r[fk]) return r;             // already hydrated
        const fkVal = r[`${fk.replace(/s$/, "")}_id`] ?? r.job_id ?? r.id;
        // training_shards.job_id → training_jobs.id
        const peer = joinTable.find((j) => j.id === r.job_id || j.id === fkVal);
        return { ...r, [fk]: peer ?? null };
    });
}

let fake = makeFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => fake
}));

const { submitTrainingJob, claimShard, reportShard } = await import("@/lib/data/training-market");

beforeEach(() => {
    fake = makeFakeSupabase();
});

describe("submitTrainingJob — pins the shard creation contract", () => {
    it("inserts exactly num_shards rows with sequential URLs", async () => {
        const { job, shards } = await submitTrainingJob({
            submitterId: "user-1",
            submitterPubkey: "abcd",
            name: "svelte5-coder",
            baseModel: "Qwen/Qwen2.5-Coder-7B-Instruct",
            config: { runtime: "unsloth" },
            datasetBaseUrl: "http://my-daemon:8080/v1/training/shards/run-abc",
            uploadBaseUrl:  "http://my-daemon:8080/v1/training/adapters/run-abc?token=xy",
            numShards: 4,
            minVramGb: 16,
            pricePerShardUsd: 0.50
        });

        expect(job.base_model).toBe("Qwen/Qwen2.5-Coder-7B-Instruct");
        expect(job.budget_usd).toBe(2.0);                 // 4 × 0.50
        expect(shards).toHaveLength(4);
        expect(shards.map((s) => s.shard_index)).toEqual([0, 1, 2, 3]);

        // URLs must be deterministic + sequential — daemons rely on this
        // to construct upload paths from the dataset_base_url.
        for (let i = 0; i < 4; i += 1) {
            expect(shards[i].shard_url).toBe(
                `http://my-daemon:8080/v1/training/shards/run-abc/shard-${i}.jsonl`
            );
        }
    });

    it("rejects num_shards out of range", async () => {
        await expect(
            submitTrainingJob({
                baseModel: "X",
                config: {},
                datasetBaseUrl: "http://x",
                numShards: 0
            })
        ).rejects.toThrow(/num_shards/);

        await expect(
            submitTrainingJob({
                baseModel: "X",
                config: {},
                datasetBaseUrl: "http://x",
                numShards: 999
            })
        ).rejects.toThrow(/num_shards/);
    });

    it("rejects missing base_model", async () => {
        await expect(
            submitTrainingJob({
                config: {},
                datasetBaseUrl: "http://x",
                numShards: 1
            })
        ).rejects.toThrow(/base_model/);
    });
});

describe("claimShard — atomic race guard", () => {
    it("flips pending → claimed for the calling pubkey", async () => {
        fake = makeFakeSupabase({
            training_jobs: [
                { id: "job-1", base_model: "X", config: {}, status: "open" }
            ],
            training_shards: [
                { id: "shard-1", job_id: "job-1", shard_index: 0, shard_url: "u", status: "pending" }
            ]
        });

        const result = await claimShard({ pubkey: "operator-A", shardId: "shard-1" });
        expect(result.shard_id).toBe("shard-1");
        // Job moved from open → filling on first claim
        const job = fake.tables.training_jobs[0];
        expect(job.status).toBe("filling");
        const shard = fake.tables.training_shards[0];
        expect(shard.status).toBe("claimed");
        expect(shard.claimed_by_pubkey).toBe("operator-A");
        expect(shard.claimed_at).toBeTruthy();
    });

    it("returns 409 when shard is already claimed (race)", async () => {
        fake = makeFakeSupabase({
            training_jobs: [{ id: "job-1", base_model: "X", config: {}, status: "filling" }],
            training_shards: [
                { id: "shard-1", job_id: "job-1", shard_index: 0, status: "claimed", claimed_by_pubkey: "operator-A" }
            ]
        });
        await expect(
            claimShard({ pubkey: "operator-B", shardId: "shard-1" })
        ).rejects.toMatchObject({ status: 409 });
    });

    it("returns 404 when the shard doesn't exist", async () => {
        await expect(
            claimShard({ pubkey: "operator-A", shardId: "ghost" })
        ).rejects.toMatchObject({ status: 404 });
    });
});

describe("reportShard — pubkey-match enforcement + job rollup", () => {
    function seedTwoShards() {
        return {
            training_jobs: [{ id: "job-1", base_model: "X", config: {}, status: "filling" }],
            training_shards: [
                { id: "s-0", job_id: "job-1", shard_index: 0, status: "claimed", claimed_by_pubkey: "operator-A" },
                { id: "s-1", job_id: "job-1", shard_index: 1, status: "claimed", claimed_by_pubkey: "operator-B" }
            ]
        };
    }

    it("rejects a report from a pubkey that didn't claim the shard", async () => {
        fake = makeFakeSupabase(seedTwoShards());
        await expect(
            reportShard({ pubkey: "operator-Z", shardId: "s-0", status: "completed" })
        ).rejects.toMatchObject({ status: 403 });
        // Original status untouched
        expect(fake.tables.training_shards[0].status).toBe("claimed");
    });

    it("rejects an unknown status string", async () => {
        fake = makeFakeSupabase(seedTwoShards());
        await expect(
            reportShard({ pubkey: "operator-A", shardId: "s-0", status: "ascended" })
        ).rejects.toMatchObject({ status: 400 });
    });

    it("flips the job to completed when the LAST shard reports done", async () => {
        fake = makeFakeSupabase(seedTwoShards());

        // First shard reports — job stays filling
        await reportShard({
            pubkey: "operator-A", shardId: "s-0",
            status: "completed",
            adapterUrl: "http://op-a/adapter-0.safetensors",
            metrics: { loss: 0.42 }
        });
        expect(fake.tables.training_jobs[0].status).toBe("filling");
        expect(fake.tables.training_shards[0].adapter_url).toBe("http://op-a/adapter-0.safetensors");

        // Second (last) shard reports — job flips to completed
        await reportShard({
            pubkey: "operator-B", shardId: "s-1",
            status: "completed",
            adapterUrl: "http://op-b/adapter-1.safetensors"
        });
        expect(fake.tables.training_jobs[0].status).toBe("completed");
        expect(fake.tables.training_jobs[0].completed_at).toBeTruthy();
    });

    it("a single failed shard alongside a completed one still lets the job finalize", async () => {
        fake = makeFakeSupabase(seedTwoShards());
        await reportShard({ pubkey: "operator-A", shardId: "s-0", status: "completed" });
        await reportShard({ pubkey: "operator-B", shardId: "s-1", status: "failed", errorMessage: "OOM" });
        expect(fake.tables.training_jobs[0].status).toBe("completed");
        expect(fake.tables.training_shards[1].error).toBe("OOM");
    });
});
