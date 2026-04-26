/**
 * Resolve the path to an engine binary.
 *
 * Lookup order:
 *   1. Explicit env var (e.g. INFERNET_ENGINE_BIN) pointing at an existing file.
 *   2. Bare command name — defer to PATH lookup at spawn time.
 *
 * A bundled-prebuild step (per-platform tarballs in `vendor/`) is intentional
 * future work: the contract is just "return something spawn() can run".
 */

import { existsSync } from "node:fs";

export function resolveBinary({ envVar, name } = {}) {
    if (envVar) {
        const fromEnv = process.env[envVar];
        if (fromEnv && existsSync(fromEnv)) return fromEnv;
    }
    if (name) return name;
    return null;
}
