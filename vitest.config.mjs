import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "apps/web")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"]
  }
});
