import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig uses jsx: "preserve" for Next; tests need React's automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/server/scanner/__tests__/empty.ts"),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
