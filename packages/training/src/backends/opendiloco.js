/**
 * OpenDiLoCo backend — cross-provider async training.
 *
 * Pattern: workers train independently for N local steps, then exchange
 * model deltas (not per-batch gradients) over the public internet. The
 * key insight is that infrequent, large updates survive WAN latency in a
 * way that synchronous all-reduce gradients cannot. From Google's DiLoCo
 * paper, implemented by Prime Intellect for the INTELLECT-1/2 runs
 * (~10B param training across volunteer GPUs).
 *
 * This is the right tool for Class C training jobs — distributed across
 * providers we don't control, with realistic public-internet links.
 *
 * Status: placeholder. Real integration: spawn a Python worker that
 * connects to the swarm coordinator, parse its training log into v1
 * protocol events. Coordinator address comes from the job config.
 *
 * https://github.com/PrimeIntellect-ai/OpenDiloCo
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "@infernetprotocol/engine";
import { TMSG, TRAINING_PROTOCOL_VERSION } from "../protocol.js";

export function createOpenDiLoCoBackend({
    coordinator = process.env.OPENDILOCO_COORDINATOR ?? null,
    localSteps = Number.parseInt(process.env.OPENDILOCO_LOCAL_STEPS ?? "500", 10) || 500
} = {}) {
    return {
        kind: "opendiloco",
        coordinator,
        localSteps,
        start({ config = {}, id } = {}) {
            const jobId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();

            (async () => {
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.META,
                    id: jobId,
                    backend: "opendiloco",
                    started_at: new Date().toISOString(),
                    base_model: config.base_model ?? null,
                    kind: config.kind ?? "pretrain",
                    swarm: { coordinator, local_steps: localSteps }
                });
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.DONE,
                    id: jobId,
                    reason: "not_implemented",
                    finished_at: new Date().toISOString(),
                    note: "OpenDiLoCo worker integration pending. Will spawn a Python worker that joins the swarm at $COORDINATOR, trains $LOCAL_STEPS steps locally, syncs deltas, repeats."
                });
                stream.end();
            })();

            return { id: jobId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}
