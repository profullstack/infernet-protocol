import { describe, expect, it } from "vitest";

import { createTrainer, TMSG } from "../packages/training/src/index.js";

async function drain(stream) {
    const out = [];
    for await (const ev of stream) out.push(ev);
    return out;
}

describe("training adapter — factory + backends", () => {
    it("createTrainer auto-selects 'stub' by default", async () => {
        const t = await createTrainer();
        expect(t.kind).toBe("stub");
    });

    it("INFERNET_TRAINING_BACKEND overrides auto-select", async () => {
        const before = process.env.INFERNET_TRAINING_BACKEND;
        process.env.INFERNET_TRAINING_BACKEND = "deepspeed";
        try {
            const t = await createTrainer();
            expect(t.kind).toBe("deepspeed");
        } finally {
            if (before === undefined) delete process.env.INFERNET_TRAINING_BACKEND;
            else process.env.INFERNET_TRAINING_BACKEND = before;
        }
    });

    it("stub trainer emits meta + steps + done(complete)", async () => {
        const t = await createTrainer({ backend: "stub", steps: 3, stepDelayMs: 1 });
        const job = t.start({ config: { kind: "fine-tune", base_model: "Qwen/Qwen2.5-7B" } });
        const events = await drain(job.stream);

        expect(events[0].type).toBe(TMSG.META);
        expect(events[0].backend).toBe("stub");
        expect(events[0].base_model).toBe("Qwen/Qwen2.5-7B");

        const steps = events.filter((e) => e.type === TMSG.STEP);
        expect(steps).toHaveLength(3);
        expect(steps[0].step).toBe(1);
        expect(steps.every((s) => typeof s.loss === "number")).toBe(true);

        const done = events[events.length - 1];
        expect(done.type).toBe(TMSG.DONE);
        expect(done.reason).toBe("complete");
        expect(done.final_step).toBe(3);
    });

    it("placeholder backends each emit meta + done(not_implemented)", async () => {
        const placeholders = ["deepspeed", "openrlhf", "opendiloco", "petals"];
        for (const backend of placeholders) {
            const t = await createTrainer({ backend });
            expect(t.kind).toBe(backend);
            const job = t.start({ config: { kind: "fine-tune", base_model: "x" } });
            const events = await drain(job.stream);

            expect(events).toHaveLength(2);
            expect(events[0].type).toBe(TMSG.META);
            expect(events[0].backend).toBe(backend);
            expect(events[1].type).toBe(TMSG.DONE);
            expect(events[1].reason).toBe("not_implemented");
            expect(typeof events[1].note).toBe("string");
        }
    });

    it("unknown backend throws", async () => {
        await expect(createTrainer({ backend: "nope" })).rejects.toThrow(/unknown training backend/);
    });

    it("stub trainer respects cancel()", async () => {
        const t = await createTrainer({ backend: "stub", steps: 100, stepDelayMs: 5 });
        const job = t.start({});
        // Cancel after a few steps land.
        setTimeout(() => job.cancel(), 20);
        const events = await drain(job.stream);
        const done = events[events.length - 1];
        expect(done.type).toBe(TMSG.DONE);
        expect(done.reason).toBe("cancel");
    });
});
