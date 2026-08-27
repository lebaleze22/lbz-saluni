import path from "node:path";
import { defineConfig } from "vitest/config";

// Suite RLS, séparée de la suite par défaut (`npm run test:rls`, jamais `npm test`).
// S'exécute contre une vraie instance Supabase : nécessite un .env avec
// NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et
// SUPABASE_SERVICE_ROLE_KEY pointant vers un projet de test, ainsi que DATABASE_URL/
// ADMIN_DATABASE_URL/DIRECT_URL (le test exerce désormais le vrai chemin applicatif
// Prisma + withRlsSession(), voir docs/architecture/014-decouplage-rls-auth-provider.md).
//
// resolve.alias : lib/db/rls-session.ts (et ce qu'il importe) utilise l'alias "@/*" —
// identique au mapping tsconfig.json — nécessaire depuis que ce test importe du code
// applicatif ; aucun test de ce projet n'en avait besoin jusqu'ici.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
