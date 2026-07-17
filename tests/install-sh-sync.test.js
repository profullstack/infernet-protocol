import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The installer served at https://infernetprotocol.com/install.sh (and read by
 * apps/web/app/api/deploy/cloud-init/route.js) is apps/web/public/install.sh.
 *
 * There is only ONE canonical source: the repo-root install.sh. The public
 * copy is GENERATED from it by apps/web/scripts/sync-install-sh.mjs on
 * predev/prebuild and is gitignored — so there's no second version to hand-
 * maintain. This test regenerates it and asserts the generator output is
 * byte-identical to the source, guarding the generator rather than policing a
 * committed duplicate.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_INSTALL = resolve(repoRoot, "install.sh");
const PUBLIC_INSTALL = resolve(repoRoot, "apps/web/public/install.sh");
const SYNC_SCRIPT = resolve(repoRoot, "apps/web/scripts/sync-install-sh.mjs");

function sha256OfFile(path) {
    const bytes = readFileSync(path);
    return createHash("sha256").update(bytes).digest("hex");
}

describe("apps/web/public/install.sh is generated from the canonical install.sh", () => {
    beforeAll(() => {
        // Regenerate the public copy from the canonical source, exactly as
        // predev/prebuild do — the file is gitignored so it may not exist yet.
        execFileSync("node", [SYNC_SCRIPT], { cwd: repoRoot });
    });

    it("canonical source exists", () => {
        expect(statSync(ROOT_INSTALL).isFile()).toBe(true);
    });

    it("generator produces a byte-for-byte identical public copy", () => {
        const rootBytes = readFileSync(ROOT_INSTALL);
        const publicBytes = readFileSync(PUBLIC_INSTALL);
        expect(rootBytes.equals(publicBytes)).toBe(true);
    });

    it("identical sha256", () => {
        expect(sha256OfFile(ROOT_INSTALL)).toBe(sha256OfFile(PUBLIC_INSTALL));
    });

    it("advertises the canonical https://infernetprotocol.com/install.sh URL", () => {
        const txt = readFileSync(PUBLIC_INSTALL, "utf8");
        expect(txt).toContain("https://infernetprotocol.com/install.sh");
    });
});
