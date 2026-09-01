# SALUNI

SALUNI est édité par LBZ.

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
tests RLS et ne crée aucun client, service ou rendez-vous de démonstration. Il crée uniquement
la fiche Staff Director réelle liée au compte SIRE, requise par la garde des pages admin.

Il peut être relancé : il réactive le tenant et le profil existants et remet le mot de
passe du compte à la valeur prévue. Les identifiants utilisables pour la connexion locale
sont affichés à la fin de l'exécution. Pour remplacer leurs valeurs par défaut, définir
`SEED_DEV_ADMIN_EMAIL` et `SEED_DEV_ADMIN_PASSWORD` dans l'environnement avant de lancer
la commande.

Après le Director, le compte Owner local peut être provisionné sans aucune donnée métier
de démonstration avec `npm run seed:owner:dev`. Par défaut :
`owner.dev@caprice-ebene.com` / `CapriceOwner2026!`. Le script est idempotent et refuse
d’écraser un autre Owner déjà présent dans le tenant.

### Stack PostgreSQL/Supabase locale de développement

La stack locale complète utilise `http://localhost:54321` afin de ne pas entrer en
collision avec un autre proxy sur le port 80. Première installation :

```bash
docker compose --env-file .env.local -f docker-compose.local.yml up -d postgres gotrue
docker compose --env-file .env.local -f docker-compose.local.yml build tooling core-api
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling npx prisma migrate deploy
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling node scripts/local-stack/set-app-runtime-password.mjs
docker compose --env-file .env.local -f docker-compose.local.yml up -d core-api nginx
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling node scripts/seed-dev.mjs
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling node scripts/seed-owner-dev.mjs
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling npm run import:catalogue
```

La dernière commande initialise, de façon idempotente, les 11 catégories et 81
prestations de `docs/Catalogue_Prestations_Caprice_Ebene.md`, ainsi que cinq postes
opérationnels de départ. Elle ne crée aucun client, rendez-vous ou membre du staff.

### Installation sur le Mac du salon

Le déploiement client ne construit pas les sources. Il télécharge les images GHCR
versionnées avec `docker-compose.client.yml`, puis une seule commande crée les secrets,
applique les migrations et initialise exactement un tenant, un Owner, son profil Staff,
5 postes, 11 catégories et 81 prestations — sans Director ni donnée opérationnelle :

```bash
./scripts/client-install/install-macos.sh
```

La procédure de release, les prérequis macOS, les sauvegardes et les mises à jour sont
documentés dans
[`docs/guides/installation-locale-macos.md`](docs/guides/installation-locale-macos.md).

La suite RLS s’exécute directement contre cette stack avec :

```bash
docker compose --env-file .env.local -f docker-compose.local.yml run --rm tooling npm run test:rls
```

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
