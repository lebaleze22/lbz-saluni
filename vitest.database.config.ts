import path from "node:path";
import { defineConfig } from "vitest/config";

if (process.env.SALUNI_DISPOSABLE_TEST !== "1") {
  throw new Error("Run npm run test:database to create an isolated disposable database.");
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/database/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
  },
});
