# LBZ (LEBALEZE)

Plateforme SaaS de gestion pour salons de beauté au Cameroun.

Stack : Next.js 14 (App Router, TypeScript strict), Supabase (Postgres + Auth + RLS),
Prisma, Tailwind CSS, shadcn/ui. Déploiement cible : Vercel.

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner les clés Supabase et les URLs Prisma
npx prisma migrate deploy
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Documentation

- `docs/steps/` — spécifications fonctionnelles par étape du produit.
- `docs/architecture/` — décisions structurantes du projet (une par fichier).

## Base de données

- `prisma/schema.prisma` — structure des tables (source de vérité, gérée par Prisma).
- `prisma/migrations/` — migrations SQL, y compris les policies Row-Level Security
  (non gérées par Prisma, écrites à la main — voir
  `docs/architecture/001-tenant-id-et-rls.md`).

## Qualité

```bash
npm run lint          # ESLint
npm run format:check  # Prettier (contrôle)
npm run format         # Prettier (écriture)
```

Un hook pre-commit (Husky + lint-staged) applique ESLint et Prettier sur les fichiers
modifiés avant chaque commit.
