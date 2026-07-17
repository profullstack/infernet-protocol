import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";

// waitForVllmModel/detectVllmModels read VLLM_HOST from the env at module-load
// time. Set the port BEFORE the (non-hoisted) dynamic import so the module
// binds to our fake vLLM server.
const PORT = 18765;
process.env.VLLM_PORT = String(PORT);
delete process.env.VLLM_HOST;
const { waitForVllmModel } = await import("../apps/cli/lib/vllm.js");

let server;
let models = []; // what the fake /v1/models returns each poll

beforeEach(() => {
    models = [];
    server = http.createServer((req, res) => {
        if (req.url === "/v1/models") {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
        } else {
            res.statusCode = 404;
            res.end();
        }
    });
    return new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

describe("waitForVllmModel", () => {
    it("returns serving:true once /v1/models lists the model", async () => {
        setTimeout(() => { models = ["hf:org/repo"]; }, 120); // appears mid-poll
        const r = await waitForVllmModel("hf:org/repo", { timeoutMs: 5000, intervalMs: 50 });
        expect(r.serving).toBe(true);
        expect(r.models).toContain("hf:org/repo");
    });

    it("times out (serving:false) when the model never appears", async () => {
        models = ["some-other-model"]; // never the one we want
        const r = await waitForVllmModel("hf:org/repo", { timeoutMs: 300, intervalMs: 50 });
        expect(r.serving).toBe(false);
        expect(r.reason).toMatch(/timed out/i);
    });

    it("bails early when the serve process has died", async () => {
        const deadPid = 2 ** 30; // a pid that does not exist
        const t0 = Date.now();
        const r = await waitForVllmModel("hf:org/repo", { pid: deadPid, timeoutMs: 5000, intervalMs: 50 });
        expect(r.serving).toBe(false);
        expect(r.reason).toMatch(/exited/i);
        expect(Date.now() - t0).toBeLessThan(2000); // returns promptly, not full timeout
    });
});
