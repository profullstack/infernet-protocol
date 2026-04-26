#!/usr/bin/env node
/**
 * IPIP-0005 phase 1 — lint guard against direct database clients in
 * code that runs on machines we don't control (browsers, CLI, SDK).
 *
 * Forbidden imports:
 *   - `@supabase/supabase-js` in apps/cli/, apps/daemon/, packages/sdk-js/
 *   - `@supabase/supabase-js` in any apps/web/ file marked "use client"
 *
 * Allowed paths (the only places a DB client may legitimately live):
 *   - apps/web/lib/supabase/server*.js
 *   - apps/web/lib/data/**         (server-only data helpers)
 *   - apps/web/app/** /route.js    (server route handlers)
 *   - apps/web/app/** /page.js     (server components by default)
 *   - tests/** (mocks, fixtures)
 *
 * Usage:
 *   node tooling/lint-no-direct-db.mjs           # exit 1 on any violation
 *   node tooling/lint-no-direct-db.mjs --json    # machine-readable output
 *
 * Or import findViolations() programmatically (vitest test does this).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_IMPORTS = [
    "@supabase/supabase-js"
    // Future replacements (Convex client, Drizzle direct, etc.) get
    // added here.
];

// Per IPIP-0005, these are the ONLY paths a DB client may live in.
const ALLOWED_PATH_PATTERNS = [
    /^apps\/web\/lib\/supabase\//,
    /^apps\/web\/lib\/data\//,
    /^apps\/web\/lib\/auth\//,
    /^apps\/web\/lib\/env\.js$/,
    /^apps\/web\/app\/.*\/route\.js$/,
    /^apps\/web\/app\/.*\/page\.js$/,
    /^tests\//,
    /^tooling\//,
    /node_modules\//
];

// Trees we scan. apps/desktop, apps/mobile etc. would join here as added.
const SCAN_ROOTS = [
    "apps/cli",
    "apps/daemon",
    "apps/web",
    "packages/sdk-js"
];

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);

function isAllowedPath(relPath) {
    const normalized = relPath.split(sep).join("/");
    return ALLOWED_PATH_PATTERNS.some((re) => re.test(normalized));
}

function* walkFiles(dir) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) {
            yield* walkFiles(full);
        } else if (st.isFile()) {
            const dot = entry.lastIndexOf(".");
            const ext = dot >= 0 ? entry.slice(dot) : "";
            if (SOURCE_EXTENSIONS.has(ext)) yield full;
        }
    }
}

function isUseClientFile(content) {
    // A "use client" directive must be the first statement in the file.
    // Tolerate leading whitespace / single-line comments before it, but
    // not other code.
    const lines = content.split("\n");
    for (const raw of lines) {
        const line = raw.trim();
        if (line === "") continue;
        if (line.startsWith("//")) continue;
        if (line.startsWith("/*")) continue;
        return /^["']use client["'];?$/.test(line);
    }
    return false;
}

/**
 * Scan a project root and return any violating imports.
 *
 * @param {{ root?: string, scanRoots?: string[] }} [opts]
 * @returns {Array<{ file: string, line: number, importPath: string, reason: string }>}
 */
export function findViolations(opts = {}) {
    const root = opts.root ?? process.cwd();
    const scanRoots = opts.scanRoots ?? SCAN_ROOTS;
    const violations = [];

    for (const scanRoot of scanRoots) {
        const absRoot = join(root, scanRoot);
        try {
            statSync(absRoot);
        } catch {
            continue; // Path doesn't exist in this checkout; skip.
        }
        for (const abs of walkFiles(absRoot)) {
            const rel = relative(root, abs);
            let content;
            try {
                content = readFileSync(abs, "utf8");
            } catch {
                continue;
            }

            const useClient = scanRoot === "apps/web" ? isUseClientFile(content) : false;

            // For apps/web, only "use client" files are off-limits — server
            // routes and server components legitimately use the DB client.
            const inForbiddenTree = scanRoot !== "apps/web" || useClient;

            // BUT if the file is on the allow-list, it's allowed regardless.
            // (The allow-list is a backstop, not the primary signal.)
            if (!inForbiddenTree) continue;
            if (isAllowedPath(rel)) continue;

            for (const forbidden of FORBIDDEN_IMPORTS) {
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i += 1) {
                    const line = lines[i];
                    // Match: import x from "@supabase/supabase-js" / require("@…") / from '…'
                    if (
                        line.includes(`"${forbidden}"`) ||
                        line.includes(`'${forbidden}'`)
                    ) {
                        violations.push({
                            file: rel,
                            line: i + 1,
                            importPath: forbidden,
                            reason: useClient
                                ? `IPIP-0005 rule 1: "use client" components must not import a DB client.`
                                : `IPIP-0005 rule 2/3: ${scanRoot}/ must not import a DB client.`
                        });
                    }
                }
            }
        }
    }

    return violations;
}

// CLI entrypoint
const isMain =
    import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
    const jsonMode = process.argv.includes("--json");
    const violations = findViolations();
    if (jsonMode) {
        process.stdout.write(JSON.stringify({ violations }, null, 2) + "\n");
    } else if (violations.length === 0) {
        process.stdout.write("✓ no IPIP-0005 violations\n");
    } else {
        process.stderr.write(`✗ ${violations.length} IPIP-0005 violation${violations.length === 1 ? "" : "s"}:\n\n`);
        for (const v of violations) {
            process.stderr.write(`  ${v.file}:${v.line}\n`);
            process.stderr.write(`    imports ${v.importPath}\n`);
            process.stderr.write(`    ${v.reason}\n\n`);
        }
        process.stderr.write("See ipips/ipip-0005.md for the full rule set.\n");
    }
    process.exit(violations.length === 0 ? 0 : 1);
}
