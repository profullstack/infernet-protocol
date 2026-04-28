/**
 * DeepSpeed backend — trusted-cluster sharded training.
 *
 * Pattern: a single provider with multiple GPUs (or multiple machines on
 * fast LAN) runs the actual training. We spawn `deepspeed` (or
 * `torchrun`) with the operator's hostfile + the job's config, parse its
 * stdout for step/loss/lr signals, and translate into our v1 protocol
 * events.
 *
 * This is the right tool for Class B training jobs (one provider's
 * cluster) — fine-tunes, LoRA, full pretraining when the operator owns
 * enough hardware. Not for Class C cross-provider training; for that
 * see opendiloco.js.
 *
 * Status: placeholder — emits a not_implemented done so the surface
 * exists and downstream callers can wire against the protocol. Real
 * integration: spawn the deepspeed/torchrun launcher under
 * EngineProcess, parse its log lines (loss / lr / step / throughput).
 *
 * https://github.com/deepspeedai/DeepSpeed
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "@infernetprotocol/engine";
import { TMSG, TRAINING_PROTOCOL_VERSION } from "../protocol.js";

export function createDeepspeedBackend({
    hostfile = process.env.DEEPSPEED_HOSTFILE ?? null,
    masterAddr = process.env.MASTER_ADDR ?? "127.0.0.1",
    masterPort = process.env.MASTER_PORT ?? "29500"
} = {}) {
    return {
        kind: "deepspeed",
        hostfile,
        masterAddr,
        start({ config = {}, id } = {}) {
            const jobId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();

            (async () => {
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.META,
                    id: jobId,
                    backend: "deepspeed",
                    started_at: new Date().toISOString(),
                    base_model: config.base_model ?? null,
                    kind: config.kind ?? "fine-tune",
                    cluster: { hostfile, master_addr: masterAddr, master_port: masterPort }
                });
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.DONE,
                    id: jobId,
                    reason: "not_implemented",
                    finished_at: new Date().toISOString(),
                    note: "DeepSpeed launcher integration pending. Will spawn `deepspeed --hostfile=$HOSTFILE` with the job's config and stream stdout into step/eval/checkpoint events."
                });
                stream.end();
            })();

            return { id: jobId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}
