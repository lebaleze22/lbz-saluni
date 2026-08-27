import { PrismaClient } from "@prisma/client";

// Connexion privilégiée (rôle `postgres`, contourne RLS — voir
// docs/architecture/014-decouplage-rls-auth-provider.md) réservée à la résolution
// d'identité : lire sa propre ligne public.users AVANT de connaître tenant_id/role,
// donc avant qu'aucune session app.* ne puisse être positionnée (problème d'amorçage).
// Ne jamais utiliser ce client pour une requête métier RLS-sensible — pour ça, voir
// lib/prisma.ts (rôle app_runtime, réellement soumis à RLS) et lib/db/rls-session.ts.
const globalForPrisma = globalThis as unknown as { adminPrisma?: PrismaClient };

export const adminPrisma =
  globalForPrisma.adminPrisma ??
  new PrismaClient({ datasources: { db: { url: process.env.ADMIN_DATABASE_URL } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.adminPrisma = adminPrisma;
