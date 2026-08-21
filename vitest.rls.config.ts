import { defineConfig } from "vitest/config";

// Suite RLS, séparée de la suite par défaut (`npm run test:rls`, jamais `npm test`).
// S'exécute contre une vraie instance Supabase : nécessite un .env avec
// NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et
// SUPABASE_SERVICE_ROLE_KEY pointant vers un projet de test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
