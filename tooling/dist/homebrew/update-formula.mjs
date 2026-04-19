#!/usr/bin/env node
/**
 * Rewrite infernet.rb with a pinned npm tarball for a given version.
 *
 *   node tooling/dist/homebrew/update-formula.mjs 1.2.3
 *
 * Downloads the tarball for `@infernet/cli@<version>` from the npm
 * registry, computes its sha256, and patches the `url`, `sha256`, and
 * `version` fields in the Ruby formula. Uses only Node built-ins so the
 * release machine doesn't need any extra tooling installed.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMULA_PATH = path.join(__dirname, "infernet.rb");
const PACKAGE = "@infernet/cli";

function fail(message) {
    process.stderr.write(`update-formula: ${message}\n`);
    process.exit(1);
}

async function downloadToBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) fail(`HTTP ${res.status} fetching ${url}`);
    const chunks = [];
    await pipeline(Readable.fromWeb(res.body), async function* (src) {
        for await (const chunk of src) {
            chunks.push(chunk);
            yield chunk;
        }
    });
    return Buffer.concat(chunks);
}

async function main() {
    const version = process.argv[2];
    if (!version) fail("usage: update-formula.mjs <version>");

    const registryUrl = `https://registry.npmjs.org/${PACKAGE.replace("/", "%2F")}/${version}`;
    const meta = await (await fetch(registryUrl)).json();
    const tarballUrl = meta?.dist?.tarball;
    if (!tarballUrl) fail(`no dist.tarball for ${PACKAGE}@${version}`);

    const tarball = await downloadToBuffer(tarballUrl);
    const sha256 = crypto.createHash("sha256").update(tarball).digest("hex");

    let formula = fs.readFileSync(FORMULA_PATH, "utf8");
    formula = formula
        .replace(/url "[^"]+"/, `url "${tarballUrl}"`)
        .replace(/sha256 "[^"]+"/, `sha256 "${sha256}"`)
        .replace(/version "[^"]+"/, `version "${version}"`);
    fs.writeFileSync(FORMULA_PATH, formula);

    process.stdout.write(`Updated ${FORMULA_PATH}\n`);
    process.stdout.write(`  version: ${version}\n`);
    process.stdout.write(`  tarball: ${tarballUrl}\n`);
    process.stdout.write(`  sha256:  ${sha256}\n`);
}

main().catch((err) => {
    fail(err?.stack ?? err?.message ?? String(err));
});
