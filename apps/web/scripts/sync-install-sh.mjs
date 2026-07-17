/**
 * Generates apps/web/public/install.sh from the canonical repo-root install.sh.
 *
 * The installer is served two ways from apps/web — the static asset at
 * /install.sh and apps/web/app/api/deploy/cloud-init/route.js — both of which
 * read apps/web/public/install.sh. Rather than hand-maintain a second copy
 * (and police it with a drift test), we treat the repo-root install.sh as the
 * ONLY source and regenerate the public copy on predev/prebuild. The generated
 * file is gitignored.
 *
 * Runs in local dev (predev), CI/build (prebuild), and inside the Docker
 * builder stage — which is why docker/Dockerfile copies install.sh into the
 * builder before `next build`.
 */

import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const repoRoot = resolve(scriptDir, "..", "..", "..");
const SOURCE = resolve(repoRoot, "install.sh");
const DEST = resolve(repoRoot, "apps", "web", "public", "install.sh");

if (!existsSync(SOURCE)) {
  console.error(`sync-install-sh: canonical installer not found at ${SOURCE}`);
  process.exit(1);
}

copyFileSync(SOURCE, DEST);
console.log(`sync-install-sh: ${SOURCE} → ${DEST}`);
