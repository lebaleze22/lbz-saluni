# 010 — Supabase reste managé, hors de Docker Compose

## Statut

Décidé et implémenté le 2026-08-21, dans le cadre de la migration de core-api vers
Docker (voir [[009-vps-docker-compose-vs-kubernetes]]).

## Contexte

En migrant `core-api` de Vercel vers un VPS + Docker Compose, la question se pose de
savoir si la base de données (Supabase : Postgres + Auth + RLS) doit, elle aussi, être
rapatriée dans `docker-compose.yml` — Supabase est open-source et peut être auto-hébergé
(image `supabase/postgres`, GoTrue, PostgREST, Realtime, Storage, Kong...).

## Décision

Supabase reste un service managé externe (supabase.com), **hors** de
`docker-compose.yml`. `core-api` continue de s'y connecter par `DATABASE_URL` /
`DIRECT_URL` (pooler pgbouncer + connexion directe) exactement comme avant la migration
— voir [[005-prisma-et-supabase]]. Le VPS n'héberge aucune base de données.

## Pourquoi

- **Auto-héberger Supabase, ce n'est pas juste ajouter un conteneur Postgres.** La
  stack complète est GoTrue (auth), PostgREST, Realtime, Storage, Kong (gateway),
  Postgres avec les extensions Supabase — six à huit services supplémentaires à faire
  tourner, mettre à jour, sauvegarder et sécuriser sur le même VPS qui vient à peine
  d'être introduit pour deux services applicatifs. Le rapport effort/bénéfice est
  mauvais à ce stade.
- **Le vrai risque d'un self-hosted Postgres, ce sont les sauvegardes et la haute
  disponibilité.** Supabase managé fournit backups automatiques, point-in-time
  recovery, mises à jour de version Postgres sans intervention manuelle. Reproduire ça
  soi-même sur un unique VPS (donc un unique point de panne matériel) serait une
  régression de fiabilité, pas un progrès — pour un produit qui gère des données
  financières de salons (paiements, cf. [[002-montants-en-fcfa]]).
- **Toute la conception RLS actuelle est bâtie sur le modèle d'auth Supabase.** Les
  fonctions `SECURITY DEFINER` (`current_tenant_id()`, `is_salon_admin()`) et les
  policies (voir [[001-tenant-id-et-rls]], [[007-verification-isolation-rls]],
  [[008-soft-delete-active-vs-is-deleted]]) reposent sur `auth.uid()` / `auth.role()`
  tels qu'exposés par GoTrue + PostgREST. Migrer vers un self-hosted signifierait
  reproduire cette même stack à l'identique pour ne rien casser — sans gagner de
  portabilité supplémentaire, puisque c'est déjà du Postgres standard côté schéma.
- **Aucun couplage réseau nécessaire.** `core-api`, dans son conteneur, se connecte à
  Supabase par une URL Postgres publique (via le pooler), exactement comme il le
  faisait depuis Vercel — ce n'est qu'un appel sortant HTTPS/Postgres classique. Il n'y
  a pas besoin que la base de données soit sur le même réseau Docker (`lbz-internal`)
  pour que ça fonctionne ; la conteneurisation de `core-api` ne change donc rien à la
  relation avec Supabase.

## Conséquences pratiques

- `docker-compose.yml` ne définit aucun service `postgres`/`supabase-*`.
- Les variables `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY` restent des
  secrets d'environnement runtime du conteneur `core-api` (`env_file: .env`, jamais
  copiées dans l'image — voir `Dockerfile`), au même titre qu'elles l'étaient comme
  variables d'environnement Vercel.
- Recommandé (hors scope de cette tâche, à faire côté configuration Supabase) : si le
  plan Supabase le permet, restreindre les connexions Postgres à l'IP publique du VPS
  une fois celle-ci connue, pour réduire la surface d'exposition de la base — le VPS
  devient alors le seul point d'entrée légitime vers Supabase, en plus des credentials.

## Ce qui déclencherait une révision de cette décision

- Coûts Supabase managé devenant disproportionnés par rapport au volume de données/de
  requêtes.
- Besoin de garanties de résidence des données ou de contrôle infra que seul un
  self-hosting complet peut fournir (contrainte réglementaire locale, par exemple).

Aucun de ces déclencheurs n'est atteint à ce stade.
