import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CLOUD_INIT_SCRIPT_BODY } from "../apps/web/lib/deploy/cloud-init-script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * tooling/cloud-init/infernet-provider.sh is the canonical, editable
 * copy. apps/web/lib/deploy/cloud-init-script.js is an inlined string
 * the route hands to clients. The two MUST stay byte-identical past
 * the shebang + comment header (which the inline copy strips because
 * the route prepends its own).
 *
 * If you edit one, edit the other. If they drift, this test fails
 * and the deploy flow silently serves stale instructions.
 */
describe("cloud-init script source-of-truth invariants", () => {
    it("inlined CLOUD_INIT_SCRIPT_BODY matches the body of tooling/cloud-init/infernet-provider.sh", () => {
        const onDisk = readFileSync(
            join(__dirname, "..", "tooling", "cloud-init", "infernet-provider.sh"),
            "utf8"
        );

        // Strip the shebang + leading top-of-file comment block (everything
        // up to and including the first `set -euo pipefail`). The inlined
        // string starts at `set -euo pipefail` because the route handler
        // prepends its own shebang + header.
        const startMarker = "set -euo pipefail\n";
        const idx = onDisk.indexOf(startMarker);
        expect(idx, "shell script must contain `set -euo pipefail`").toBeGreaterThan(-1);
        const onDiskBody = onDisk.slice(idx);

        expect(CLOUD_INIT_SCRIPT_BODY).toBe(onDiskBody);
    });

    it("script body uses bash's strict mode", () => {
        expect(CLOUD_INIT_SCRIPT_BODY).toContain("set -euo pipefail");
    });

    it("script body honors INFERNET_BEARER and INFERNET_CONTROL_PLANE env vars", () => {
        expect(CLOUD_INIT_SCRIPT_BODY).toMatch(/INFERNET_BEARER:-/);
        expect(CLOUD_INIT_SCRIPT_BODY).toMatch(/INFERNET_CONTROL_PLANE:-/);
    });

    it("script body ends in `exec infernet start --foreground` so the daemon doesn't get reaped", () => {
        expect(CLOUD_INIT_SCRIPT_BODY.trimEnd()).toMatch(/exec infernet start --foreground$/);
    });
});
