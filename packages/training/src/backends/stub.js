/**
 * Stub trainer — emits a synthetic training run in-process.
 *
 * Lets the rest of the system (job queue, event sink, dashboard) be
 * exercised end-to-end without a real PyTorch / DeepSpeed / Petals
 * runtime. Real backends slot in behind the same interface.
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "@infernetprotocol/engine";
import { TMSG, TRAINING_PROTOCOL_VERSION } from "../protocol.js";

export function createStubTrainer({ steps = 8, stepDelayMs = 25 } = {}) {
    return {
        kind: "stub",
        start({ config = {}, id } = {}) {
            const jobId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();

            (async () => {
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.META,
                    id: jobId,
                    started_at: new Date().toISOString(),
                    backend: "stub",
                    world_size: 1,
                    base_model: config.base_model ?? null,
                    kind: config.kind ?? "fine-tune"
                });

                for (let s = 1; s <= steps; s += 1) {
                    if (ctrl.signal.aborted) break;
                    await sleep(stepDelayMs, ctrl.signal);
                    stream.push({
                        v: TRAINING_PROTOCOL_VERSION,
                        type: TMSG.STEP,
                        id: jobId,
                        step: s,
                        loss: Math.exp(-s / 4) + 0.1,
                        lr: 1e-4,
                        throughput: 1024
                    });
                }

                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.DONE,
                    id: jobId,
                    reason: ctrl.signal.aborted ? "cancel" : "complete",
                    final_step: steps,
                    finished_at: new Date().toISOString()
                });
                stream.end();
            })();

            return { id: jobId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}

function sleep(ms, signal) {
    return new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(t);
                resolve();
            }, { once: true });
        }
    });
}
