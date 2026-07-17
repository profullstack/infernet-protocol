/**
 * Vitest global setup: generate apps/web/public/install.sh before the suite.
 *
 * The public installer is a build artifact (generated from the canonical
 * repo-root install.sh by apps/web/scripts/sync-install-sh.mjs on
 * predev/prebuild) and is gitignored. The test job runs `vitest run` without
 * a prebuild, so on a fresh checkout the file is absent — which breaks every
 * test that reads it (cloud-init-route, install-sh-sync). Regenerate it once
 * here so the whole suite sees the same file production serves.
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default function setup() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  execFileSync(
    "node",
    [resolve(repoRoot, "apps/web/scripts/sync-install-sh.mjs")],
    { cwd: repoRoot, stdio: "inherit" }
  );
}
