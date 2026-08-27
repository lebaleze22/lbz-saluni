# syntax=docker/dockerfile:1
#
# Image de production pour core-api (Next.js 14, App Router).
# Voir docs/architecture/009-vps-docker-compose-vs-kubernetes.md pour le contexte de
# déploiement (VPS + Docker Compose) et docker-compose.yml pour l'assemblage des
# services (core-api + nginx, réseau lbz-internal).
#
# Trois stages :
#   1. deps    — installe les dépendances npm (couche mise en cache tant que
#                package*.json ne change pas).
#   2. builder — génère le client Prisma et construit Next.js en sortie "standalone"
#                (next.config.mjs) : le build ne trace que les fichiers réellement
#                nécessaires à l'exécution, pas tout node_modules.
#   3. runner  — image finale, minimale : uniquement le serveur Next.js standalone,
#                les assets statiques, et le client Prisma généré (voir note plus bas).
#
# N'exécute PAS `prisma migrate deploy` au démarrage : les migrations RLS de ce projet
# sont écrites à la main et revues avant application (cf. docs/architecture/
# 001-tenant-id-et-rls.md) — les appliquer automatiquement au boot d'un conteneur serait
# risqué. Elles restent un geste manuel/CI séparé, hors de cette image.

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# 1. deps
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# openssl est requis par le moteur Prisma sur Alpine (musl).
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci

# ---------------------------------------------------------------------------
# 2. builder
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* est inliné dans le bundle CLIENT au moment du build, pas au runtime —
# doit donc être fourni comme build arg (docker-compose.yml -> build.args, ou
# --build-arg en CI), jamais seulement comme variable d'environnement du conteneur.
# Ce sont des clés publiques (anon key Supabase), sans risque à faire transiter par les
# arguments de build / les layers de l'image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_TELEMETRY_DISABLED=1

# Le client Prisma doit être régénéré ici (pas seulement copié depuis deps) : il faut le
# binaire moteur natif de CETTE plateforme (linux/musl), différent de celui généré sur
# la machine de dev (Windows/macOS).
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# 3. runner — image de production, minimale
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Sortie "standalone" : serveur Next.js + dépendances tracées uniquement.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Le traçage de fichiers de Next.js n'embarque pas de façon fiable le moteur Prisma
# (chargé dynamiquement au runtime, pas importé statiquement) — copie explicite du
# client généré pour que `@prisma/client` fonctionne dans l'image standalone.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
