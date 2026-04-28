import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * apps/web/public/install.sh is served as a static asset at
 * https://infernetprotocol.com/install.sh. It MUST stay byte-identical
 * to the canonical install.sh at the repo root.
 *
 * Whenever you edit install.sh, also `cp install.sh apps/web/public/install.sh`
 * (or run `pnpm install:sh:sync` if/when we add a script for it).
 *
 * This test fails loud if they drift, so the public install ramp can
 * never silently fall behind the canonical one.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_INSTALL = resolve(repoRoot, "install.sh");
const PUBLIC_INSTALL = resolve(repoRoot, "apps/web/public/install.sh");

function sha256OfFile(path) {
    const bytes = readFileSync(path);
    return createHash("sha256").update(bytes).digest("hex");
}

describe("install.sh is in sync with apps/web/public/install.sh", () => {
    it("both files exist", () => {
        expect(statSync(ROOT_INSTALL).isFile()).toBe(true);
        expect(statSync(PUBLIC_INSTALL).isFile()).toBe(true);
    });

    it("byte-for-byte identical", () => {
        const rootBytes = readFileSync(ROOT_INSTALL);
        const publicBytes = readFileSync(PUBLIC_INSTALL);
        if (!rootBytes.equals(publicBytes)) {
            throw new Error(
                "install.sh and apps/web/public/install.sh have drifted.\n" +
                "Run:  cp install.sh apps/web/public/install.sh\n"
            );
        }
        expect(rootBytes.equals(publicBytes)).toBe(true);
    });

    it("identical sha256", () => {
        expect(sha256OfFile(ROOT_INSTALL)).toBe(sha256OfFile(PUBLIC_INSTALL));
    });

    it("public copy advertises the canonical https://infernetprotocol.com/install.sh URL", () => {
        const txt = readFileSync(PUBLIC_INSTALL, "utf8");
        expect(txt).toContain("https://infernetprotocol.com/install.sh");
    });
});
