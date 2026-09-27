import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    setupFiles: ["./tests/setup-env.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
      "next/cache": path.resolve(__dirname, "./tests/mocks/next-cache.ts"),
      "next/headers": path.resolve(__dirname, "./tests/mocks/next-headers.ts"),
    },
  },
});
