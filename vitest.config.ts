import { defineConfig } from "vitest/config";

// Configuration par défaut de la suite de tests (`npm test`).
// tests/rls/ est volontairement exclu : ces tests ont des effets de bord réels sur une
// instance Supabase et ne s'exécutent que via `npm run test:rls`
// (voir vitest.rls.config.ts et docs/architecture/007-verification-isolation-rls.md).
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "tests/rls/**"],
  },
});
