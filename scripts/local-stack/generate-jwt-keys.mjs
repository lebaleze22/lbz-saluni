// Génère les clés anon/service_role (JWT HS256) pour la stack locale GoTrue — voir
// docs/architecture/017-stack-locale-caprice.md et .env.local.example.
//
// Aucune dépendance npm : implémentation HS256 manuelle avec le module `crypto` natif
// de Node. Une bibliothèque JWT généraliste (jsonwebtoken, jose...) serait sur-dimensionnée
// pour signer deux jetons une seule fois, à l'installation — pas un besoin récurrent en
// production (l'app elle-même ne signe jamais de JWT, seul GoTrue le fait).
//
// GoTrue valide le rôle admin via GOTRUE_JWT_ADMIN_ROLES=service_role
// (docker-compose.local.yml) : le jeton "service_role" généré ici DOIT porter
// `role: "service_role"` signé avec le MÊME secret que GOTRUE_JWT_SECRET, sans quoi
// SUPABASE_SERVICE_ROLE_KEY (utilisé par scripts/seed-dev.mjs,
// scripts/import-catalogue-caprice.mjs, et l'API admin de création d'utilisateurs) sera
// rejeté par GoTrue.
import { createHmac } from "node:crypto";

const secret = process.argv[2] ?? process.env.GOTRUE_JWT_SECRET;
if (!secret) {
  console.error("Usage: node scripts/local-stack/generate-jwt-keys.mjs <GOTRUE_JWT_SECRET>");
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const tenYears = 10 * 365 * 24 * 60 * 60;

const anonKey = sign({ role: "anon", iss: "lbz-local", iat: now, exp: now + tenYears });
const serviceRoleKey = sign({
  role: "service_role",
  iss: "lbz-local",
  iat: now,
  exp: now + tenYears,
});

console.log("# À coller dans .env.local :");
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
