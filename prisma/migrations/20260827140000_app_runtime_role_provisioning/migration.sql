-- Formalise dans l'historique de migrations le provisioning du rôle applicatif
-- restreint `app_runtime` (voir docs/architecture/014-decouplage-rls-auth-provider.md).
--
-- Gap comblé ici : ce rôle avait été créé le 2026-08-27 via un script ponctuel
-- (hors migration), pour vérifier rapidement le mécanisme avant de s'engager. Cela
-- laissait l'historique de migrations incapable de reconstituer seul l'état de la base
-- sur un environnement neuf — contraire au principe "reproductible sur un environnement
-- neuf" de docs/architecture/005-prisma-et-supabase.md, déjà explicite pour les
-- policies RLS. Cette migration ne change RIEN sur l'environnement actuel (le rôle
-- existe déjà, avec le vrai mot de passe déjà en place dans DATABASE_URL) ; elle rend
-- seulement cet état reproductible ailleurs.
--
-- Idempotent par construction :
--   - `CREATE ROLE` est gardé par un bloc DO / IF NOT EXISTS (Postgres n'a pas de
--     `CREATE ROLE IF NOT EXISTS` natif) — ne s'exécute que si le rôle n'existe pas
--     déjà, donc sans effet sur cette base.
--   - `GRANT` et `ALTER TABLE ... FORCE ROW LEVEL SECURITY` sont naturellement
--     idempotents : ré-accorder un droit déjà accordé, ou re-forcer une contrainte déjà
--     active, n'est pas une erreur.
--
-- Sur un environnement NEUF : le bloc DO crée le rôle avec un mot de passe arbitraire
-- (placeholder, jamais utilisé sur cette base). L'opérateur doit ensuite exécuter
-- `ALTER ROLE app_runtime WITH PASSWORD '<secret réel>'` avant de brancher
-- `DATABASE_URL` dessus — cette migration pose la structure (rôle, droits, RLS forcé),
-- jamais un secret réutilisable.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime with login nosuperuser nocreatedb nocreaterole nobypassrls
      noreplication inherit password 'change-me-before-production-use';
  end if;
end
$$;

-- Membre de `authenticated` : toutes les policies RLS du projet sont scopées
-- `to authenticated` — un rôle qui en est membre s'y voit appliquer les mêmes
-- policies, sans modifier une seule policy (vérifié empiriquement, voir ADR 014).
grant authenticated to app_runtime;
grant usage on schema public to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;

-- FORCE ROW LEVEL SECURITY : nécessaire uniquement pour un rôle *propriétaire* d'une
-- table (exempté de RLS par défaut) — sans effet pratique ici puisque app_runtime ne
-- possède aucune table, posé par cohérence et pour ne dépendre d'aucune hypothèse sur
-- la propriété future des tables.
alter table "tenants" force row level security;
alter table "users" force row level security;
alter table "staff" force row level security;
alter table "job_titles" force row level security;
alter table "clients" force row level security;
alter table "services" force row level security;
alter table "appointments" force row level security;
alter table "appointment_services" force row level security;
alter table "payments" force row level security;
