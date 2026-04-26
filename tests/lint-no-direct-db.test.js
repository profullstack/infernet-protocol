import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { findViolations } from "../tooling/lint-no-direct-db.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("IPIP-0005 lint guard — findViolations()", () => {
    describe("on the real repo", () => {
        it("currently has no violations", () => {
            const violations = findViolations({ root: repoRoot });
            if (violations.length > 0) {
                // Print them so a regression is debuggable.
                for (const v of violations) {
                    console.error(`${v.file}:${v.line} ${v.importPath} — ${v.reason}`);
                }
            }
            expect(violations).toHaveLength(0);
        });
    });

    describe("on a synthetic violating tree", () => {
        let tmpRoot;

        beforeEach(() => {
            tmpRoot = mkdtempSync(join(tmpdir(), "ipip-0005-test-"));
        });

        afterEach(() => {
            try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
        });

        it("flags @supabase/supabase-js inside apps/cli/", () => {
            const dir = join(tmpRoot, "apps", "cli", "lib");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "bad.js"),
                `import { createClient } from "@supabase/supabase-js";\nexport const c = createClient();\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(1);
            expect(violations[0]).toMatchObject({
                file: "apps/cli/lib/bad.js",
                importPath: "@supabase/supabase-js"
            });
            expect(violations[0].reason).toMatch(/IPIP-0005/);
        });

        it("flags @supabase/supabase-js inside packages/sdk-js/", () => {
            const dir = join(tmpRoot, "packages", "sdk-js", "src");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "leak.js"),
                `import sb from "@supabase/supabase-js";\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(1);
            expect(violations[0].file).toBe("packages/sdk-js/src/leak.js");
        });

        it("flags @supabase/supabase-js in a 'use client' apps/web/ file", () => {
            const dir = join(tmpRoot, "apps", "web", "components");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "bad-client.jsx"),
                `"use client";\nimport { createClient } from "@supabase/supabase-js";\nexport default function X() { return null; }\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(1);
            expect(violations[0].file).toBe("apps/web/components/bad-client.jsx");
            expect(violations[0].reason).toMatch(/use client/);
        });

        it("does NOT flag a server-side apps/web file (no 'use client')", () => {
            const dir = join(tmpRoot, "apps", "web", "lib", "data");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "ok.js"),
                `import "server-only";\nimport { createClient } from "@supabase/supabase-js";\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(0);
        });

        it("does NOT flag tests/ fixtures", () => {
            const dir = join(tmpRoot, "tests");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "fixture.js"),
                `// mocks\nimport "@supabase/supabase-js";\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(0);
        });

        it("treats single-quote and double-quote imports identically", () => {
            const dir = join(tmpRoot, "apps", "cli", "lib");
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, "single.js"),
                `import { createClient } from '@supabase/supabase-js';\n`
            );
            const violations = findViolations({ root: tmpRoot });
            expect(violations).toHaveLength(1);
        });
    });
});
