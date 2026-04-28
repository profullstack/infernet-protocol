/**
 * OpenRLHF backend — RLHF training with vLLM rollouts + DeepSpeed updates.
 *
 * Pattern: classic actor-critic RLHF where vLLM workers do fast generation
 * (rollouts) and DeepSpeed/FSDP workers do the gradient updates. Ray
 * coordinates the pipeline. This is the natural pair to our existing
 * vLLM engine adapter — same operator, same hardware, just driven by an
 * RL training loop instead of a chat request.
 *
 * Lands as Class C-light: trusted-cluster training with vLLM in the loop.
 * The cross-provider variant would compose OpenRLHF's gradient layer with
 * OpenDiLoCo's WAN-tolerant delta exchange — out of scope for v1.
 *
 * Status: placeholder. Real integration: spawn `openrlhf train_xxx.py`
 * with a Ray cluster URL and the job's reward model + dataset config,
 * parse training log into v1 protocol events.
 *
 * https://github.com/OpenRLHF/OpenRLHF
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "@infernetprotocol/engine";
import { TMSG, TRAINING_PROTOCOL_VERSION } from "../protocol.js";

export function createOpenRLHFBackend({
    rayAddress = process.env.RAY_ADDRESS ?? "auto",
    vllmHost = process.env.VLLM_HOST ?? "http://localhost:8000",
    rolloutWorldSize = Number.parseInt(process.env.OPENRLHF_ROLLOUT_WORLD ?? "1", 10) || 1,
    actorWorldSize = Number.parseInt(process.env.OPENRLHF_ACTOR_WORLD ?? "1", 10) || 1
} = {}) {
    return {
        kind: "openrlhf",
        rayAddress,
        vllmHost,
        start({ config = {}, id } = {}) {
            const jobId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();

            (async () => {
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.META,
                    id: jobId,
                    backend: "openrlhf",
                    started_at: new Date().toISOString(),
                    base_model: config.base_model ?? null,
                    kind: config.kind ?? "rlhf-rollout",
                    cluster: {
                        ray_address: rayAddress,
                        vllm_host: vllmHost,
                        rollout_world_size: rolloutWorldSize,
                        actor_world_size: actorWorldSize
                    }
                });
                stream.push({
                    v: TRAINING_PROTOCOL_VERSION,
                    type: TMSG.DONE,
                    id: jobId,
                    reason: "not_implemented",
                    finished_at: new Date().toISOString(),
                    note: "OpenRLHF integration pending. Will join Ray cluster $RAY_ADDRESS, drive $ROLLOUT_WORLD vLLM workers at $VLLM_HOST for generation, $ACTOR_WORLD DeepSpeed workers for updates."
                });
                stream.end();
            })();

            return { id: jobId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}
