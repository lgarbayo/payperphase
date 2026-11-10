import { defineConfig } from "vitest/config";
import path from "node:path";

// Run tests in Spain's timezone so local-time date bugs surface (dates must be UTC date-only).
process.env.TZ ??= "Europe/Madrid";

// Scaffold-owned. Default environment is node; component tests opt into jsdom with
// a `// @vitest-environment jsdom` docblock on the first line of the test file.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@data": path.resolve(__dirname, "data"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15_000,
  },
});
