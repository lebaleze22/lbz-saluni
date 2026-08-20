# 005 — Prisma pour le schéma/migrations, Supabase pour Auth + RLS

## Contexte

Prisma et Supabase se recouvrent partiellement (les deux peuvent gérer un schéma
Postgres). Il faut une frontière claire pour éviter que les deux outils se marchent
dessus.

## Décision

- **Prisma** est la source de vérité pour la _structure_ des tables métier
  (`prisma/schema.prisma`) et pour les migrations de structure
  (`prisma/migrations/<timestamp>_<nom>/migration.sql`, générées par Prisma).
- **RLS n'est pas modélisée par Prisma** (Prisma n'a pas de primitive pour les policies
  Postgres). Les policies vivent en SQL brut dans leur propre dossier de migration
  (`00000000000001_rls_policies/`), appliqué après la migration de structure via le
  même mécanisme (`prisma migrate deploy` exécute les migrations dans l'ordre de leurs
  dossiers). Voir [[001-tenant-id-et-rls]].
- **Supabase Auth** reste l'unique source de vérité pour l'authentification
  (`auth.users`). `public.users.id` est une FK 1:1 vers `auth.users.id` — Prisma ne
  modélise jamais le schéma `auth` (propriété de Supabase, non versionnée ici).
- Deux clients Supabase distincts dans `lib/supabase/` :
  - `client.ts` (`createBrowserClient`) — Client Components, s'appuie sur les cookies
    du navigateur.
  - `server.ts` (`createServerClient`) — Server Components / Route Handlers, lit/écrit
    les cookies via l'API `cookies()` de Next.js.
  - `middleware.ts` — rafraîchit la session à chaque requête (appelé depuis le
    `middleware.ts` racine). Ne contient aucune logique de routage applicatif.
- `lib/prisma.ts` exporte un singleton `PrismaClient` (pattern standard Next.js pour
  éviter l'épuisement de connexions en hot-reload dev).

## Connexions base de données

Deux variables d'environnement distinctes (`.env.example`) :

- `DATABASE_URL` — connexion _pooled_ (port 6543, PgBouncer côté Supabase), utilisée par
  le client Prisma à l'exécution (compatible serverless Vercel).
- `DIRECT_URL` — connexion directe (port 5432), utilisée uniquement par
  `prisma migrate` (les migrations nécessitent une connexion non poolée).

## Conséquences

- Un changement de structure de table passe toujours par `schema.prisma` +
  `prisma migrate dev`, jamais par une modification manuelle en base.
- Un changement de policy RLS passe par une nouvelle migration SQL manuelle dans
  `prisma/migrations/`, jamais par l'éditeur SQL du dashboard Supabase en direct (pour
  rester reproductible sur un environnement neuf).
