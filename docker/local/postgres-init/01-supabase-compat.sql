-- Compatibilité minimale Supabase, nécessaire UNIQUEMENT pour que l'historique complet
-- des migrations Prisma (prisma/migrations/) rejoue sans erreur sur un Postgres vanilla.
-- Voir docs/architecture/017-stack-locale-caprice.md.
--
-- Deux besoins distincts couverts ici :
--
-- 1. Le rôle `authenticated` : chaque policy RLS de ce projet est scopée `TO
--    authenticated` (jamais `TO public`), et la migration
--    20260827140000_app_runtime_role_provisioning fait `GRANT authenticated TO
--    app_runtime`. Sans ce rôle, TOUTE la chaîne de migrations échouerait dès la
--    première (00000000000001_rls_policies).
--    `anon`/`service_role` ne sont référencés par AUCUNE policy ni migration de ce
--    projet (vérifié par recherche exhaustive dans prisma/migrations/ avant d'écrire ce
--    script) — volontairement PAS créés ici : ce projet ne fait jamais tourner
--    PostgREST, le seul composant qui donnerait un sens fonctionnel à ces deux rôles.
--
-- 2. Le schéma `auth` et une fonction stub `auth.uid()` : trois migrations
--    historiques (00000000000001_rls_policies, 20260821120001_soft_delete_rls_filtering,
--    20260826140100_owner_role_rls), déjà appliquées sur le projet Supabase Cloud et
--    donc IMMUABLES (les modifier casserait la vérification de checksum de Prisma sur
--    cet environnement — voir docs/architecture/005-prisma-et-supabase.md), appellent
--    littéralement auth.uid() dans leur SQL. Une migration ultérieure
--    (20260826170000_decouple_rls_from_supabase_auth) a déjà remplacé TOUTE la logique
--    qui en dépendait par des variables de session applicatives
--    (docs/architecture/014-decouplage-rls-auth-provider.md) : à la fin du rejeu de
--    l'historique, plus AUCUNE policy n'appelle auth.uid(). Cette fonction stub n'a donc
--    besoin d'être *appelable* pendant le rejeu (pour que les anciennes migrations ne
--    lèvent pas "function auth.uid() does not exist"), jamais *correcte*
--    sémantiquement — elle ne sera jamais invoquée par l'état final de l'application,
--    qui ne passe jamais par PostgREST (le mécanisme request.jwt.claims que le vrai
--    auth.uid() de Supabase lit n'existe nulle part dans cette stack).
--
-- GoTrue (démarré après Postgres, voir docker-compose.local.yml) crée ensuite ses
-- propres tables dans ce même schéma `auth` via ses migrations internes (`CREATE TABLE
-- IF NOT EXISTS`) — sans conflit avec ce script, qui ne crée que le schéma lui-même et
-- une fonction, jamais de table.
--
-- Exécuté automatiquement par l'image officielle postgres au premier démarrage
-- (docker-entrypoint-initdb.d), jamais rejoué sur un volume de données déjà initialisé.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid
$$;
