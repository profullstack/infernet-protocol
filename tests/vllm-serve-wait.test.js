import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// waitForVllmModel/detectVllmModels read VLLM_HOST from the env at module-load
// time. Set the port BEFORE the (non-hoisted) dynamic import so the module
// binds to our fake vLLM server. Point XDG_CONFIG_HOME at a temp dir so the
// log helpers read a vllm.log we control.
const PORT = 18765;
process.env.VLLM_PORT = String(PORT);
delete process.env.VLLM_HOST;
const XDG = await fs.mkdtemp(path.join(os.tmpdir(), "infernet-vllm-"));
process.env.XDG_CONFIG_HOME = XDG;
const LOG = path.join(XDG, "infernet", "vllm.log");
await fs.mkdir(path.dirname(LOG), { recursive: true });
const { waitForVllmModel, extractVllmError } = await import("../apps/cli/lib/vllm.js");

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

describe("extractVllmError", () => {
    it("surfaces the real OOM root cause, not the generic wrapper line", async () => {
        // A realistic vLLM failure: the true cause (KV-cache OOM) is printed
        // far ABOVE the API-server traceback that ends in the generic wrapper.
        const log = [
            "(EngineCore_0 pid=1) INFO loading model weights...",
            "(EngineCore_0 pid=1) INFO Model loaded in 42s",
            "(EngineCore_0 pid=1) ERROR ValueError: To serve at least one request with the model's max seq len (262144), (72.00 GiB KV cache) is needed, which is larger than the available KV cache memory (18.30 GiB). Try increasing gpu_memory_utilization or decreasing max_model_len.",
            "(EngineCore_0 pid=1) Process EngineCore_0 died.",
            ...Array.from({ length: 30 }, (_, i) => `(APIServer pid=9) File "async_llm.py", line ${i}, in init`),
            "(APIServer pid=9) RuntimeError: Engine core initialization failed. See root cause above. Failed core proc(s): {}",
        ].join("\n");
        await fs.writeFile(LOG, log);
        const out = await extractVllmError();
        expect(out).toMatch(/KV cache|max seq len|262144/);
        expect(out).not.toMatch(/Engine core initialization failed/);
    });

    it("falls back to the tail when no error pattern is present", async () => {
        await fs.writeFile(LOG, "line1\nline2\nline3\n");
        const out = await extractVllmError();
        expect(out).toContain("line3");
    });
});
