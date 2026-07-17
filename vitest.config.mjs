import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "apps/web"),
      "server-only": path.join(rootDir, "tests/.server-only-stub.js")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    // Generate the gitignored apps/web/public/install.sh (a build artifact)
    // before any test runs, so tests that read it work on a fresh checkout
    // without a prebuild.
    globalSetup: ["./tests/global-setup.js"]
  }
});
