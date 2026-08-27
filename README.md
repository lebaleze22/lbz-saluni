# LBZ (LEBALEZE)

Plateforme SaaS de gestion pour salons de beauté au Cameroun.

Stack : Next.js 14 (App Router, TypeScript strict), Supabase (Postgres + Auth + RLS),
Prisma, Tailwind CSS, shadcn/ui. Déploiement : Docker sur VPS (voir
`docs/architecture/009-vps-docker-compose-vs-kubernetes.md`), Supabase reste géré à
part (voir `docs/architecture/010-supabase-managed-hors-docker-compose.md`).

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner les clés Supabase et les URLs Prisma
npx prisma migrate deploy
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

### Compte de développement Caprice D'Ebène

Une fois les migrations appliquées, créer le tenant réel et le compte `salon_admin` de
SIRE avec :

```bash
npm run seed:dev
```

Le script lit `.env.local`, puis `.env`, et utilise `NEXT_PUBLIC_SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY`. Ces variables doivent pointer vers la base de développement,
jamais vers la base de test RLS jetable ni vers la production. Le seed est séparé des
tests RLS et ne crée aucun client, service, membre du staff ou rendez-vous de démonstration.

Il peut être relancé : il réactive le tenant et le profil existants et remet le mot de
passe du compte à la valeur prévue. Les identifiants utilisables pour la connexion locale
sont affichés à la fin de l'exécution. Pour remplacer leurs valeurs par défaut, définir
`SEED_DEV_ADMIN_EMAIL` et `SEED_DEV_ADMIN_PASSWORD` dans l'environnement avant de lancer
la commande.

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

## Docker / déploiement

```bash
cp .env.example .env   # si pas déjà fait — mêmes variables qu'en dev
docker compose up --build
```

Démarre `core-api` (image de production, voir `Dockerfile`) et `nginx` (reverse proxy,
voir `nginx/default.conf`) sur le réseau Docker `lbz-internal`. Ouvrir
[http://localhost](http://localhost) (port 80, via nginx).

En production, le déploiement est automatisé par `.github/workflows/deploy.yml` : build

- push de l'image sur GHCR à chaque push sur `main`, puis `docker compose pull && up -d`
  sur le VPS par SSH — voir l'en-tête de ce fichier pour la liste des secrets GitHub
  requis (non encore configurés au moment de l'écriture de ce README).
