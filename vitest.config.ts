import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // Tes integrasi berbagi satu database kds_test: jalankan berkas satu per satu.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { TZ: "Asia/Jakarta" },
  },
});
