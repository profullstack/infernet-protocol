/**
 * Mojo backend — drives an external Mojo+MAX engine binary over the v1
 * NDJSON protocol. The binary is built from `engine/mojo/` (sibling to
 * `supabase/`); see that directory's README for build instructions.
 */

import { EngineProcess } from "../engine-process.js";
import { resolveBinary } from "../resolve-binary.js";

export async function createMojoBackend({
    binary,
    model = null,
    args = [],
    env = {}
} = {}) {
    const bin =
        binary ?? resolveBinary({ envVar: "INFERNET_ENGINE_BIN", name: "infernet-engine" });
    if (!bin) {
        throw new Error(
            "no Mojo engine binary found — set INFERNET_ENGINE_BIN or place `infernet-engine` on PATH"
        );
    }

    const proc = new EngineProcess({ binary: bin, args, env, model });
    await proc.start();

    return {
        kind: "mojo",
        binary: bin,
        generate: (req) => proc.generate(req),
        shutdown: (opts) => proc.shutdown(opts)
    };
}
