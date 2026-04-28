/**
 * Petals backend — trustless P2P inference + fine-tuning of large LLMs.
 *
 * Pattern: pipeline-parallel sharding across volunteer GPUs over the
 * public internet. Each peer holds N transformer layers; inference is
 * a chain of forward-pass calls between peers. Fine-tuning works the
 * same way (gradients propagate backwards through the chain).
 *
 * Closest existing FOSS to "trustless P2P training" — built by the
 * BigScience/HuggingFace team, MIT-licensed, demonstrated up to ~176B
 * params (BLOOM). Latency makes it batch-only for inference; training
 * works in long-running async jobs.
 *
 * Status: placeholder. Real integration: spawn a Python worker that
 * joins the public swarm (or a private one), advertises which layers
 * it holds, accepts forward/backward calls.
 *
 * https://github.com/bigscience-workshop/petals
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "@infernetprotocol/engine";
import { TMSG, TRAINING_PROTOCOL_VERSION } from "../protocol.js";

export function createPetalsBackend({
    swarm = process.env.PETALS_SWARM ?? "public",
    initialPeers = process.env.PETALS_INITIAL_PEERS ?? null
} = {}) {
    return {
        kind: "petals",
        swarm,
        initialPeers,
        start({ config = {}, id } = {}) {
            const jobId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();

            (async () => {
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.META,
                    id: jobId,
                    backend: "petals",
                    started_at: new Date().toISOString(),
                    base_model: config.base_model ?? null,
                    kind: config.kind ?? "lora",
                    swarm: { name: swarm, initial_peers: initialPeers }
                });
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.DONE,
                    id: jobId,
                    reason: "not_implemented",
                    finished_at: new Date().toISOString(),
                    note: "Petals worker integration pending. Will join swarm '$SWARM' (initial peers $PETALS_INITIAL_PEERS), advertise locally-held layers of $BASE_MODEL, accept forward/backward passes."
                });
                stream.end();
            })();

            return { id: jobId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}
