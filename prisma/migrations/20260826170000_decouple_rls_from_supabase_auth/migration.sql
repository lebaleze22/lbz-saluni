-- Découplage des fonctions RLS de Supabase Auth (auth.uid() / auth.users).
-- Voir docs/architecture/014-decouplage-rls-auth-provider.md pour la décision complète.
--
-- Portée stricte : seule la SOURCE de l'identité que lisent ces fonctions change.
-- Aucun schéma de table, aucune policy (au sens "qui a le droit de faire quoi") n'est
-- modifiée par cette migration — chaque policy continue d'appeler exactement les mêmes
-- fonctions (current_tenant_id, is_salon_admin, is_owner), qui continuent de renvoyer
-- exactement la même chose pour la même identité réelle. Seul CE QUE la fonction lit en
-- interne change : plus de jointure vers public.users via auth.uid(), mais des variables
-- de session Postgres (GUC) dédiées, positionnées par la couche applicative après
-- vérification du JWT Supabase (voir lib/db/rls-session.ts).
--
-- `SECURITY DEFINER` est retiré des 3 fonctions existantes (et absent de la nouvelle
-- current_user_id()) : il n'avait été introduit à l'origine que pour contourner RLS lors
-- de la lecture de public.users (éviter une récursion de policy, cf.
-- docs/architecture/001-tenant-id-et-rls.md). Ces fonctions ne lisent plus aucune table —
-- seulement current_setting() — donc aucun privilège élevé n'est plus nécessaire.
-- Principe du moindre privilège : ne pas garder SECURITY DEFINER "au cas où".

-- ---------------------------------------------------------------------------
-- current_tenant_id() — lit app.tenant_id au lieu de résoudre via auth.uid().
-- current_setting(..., true) : mode "missing_ok", ne lève jamais d'erreur si la
-- variable n'a pas été positionnée (ex. connexion qui ne passe pas par la couche
-- applicative attendue, ou session sans identité). nullif(..., '') traite aussi bien
-- "jamais définie" (NULL) que "définie à vide" (chaîne vide, cas explicite d'une requête
-- non authentifiée côté applicatif) de la même façon : résultat NULL, donc aucune ligne
-- ne peut jamais satisfaire `tenant_id = current_tenant_id()` — accès refusé par défaut,
-- jamais un accès total, exactement l'exigence de la mission.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- current_user_id() — nouvelle fonction. N'était pas nommée explicitement dans la
-- demande (qui cite current_tenant_id/is_owner/is_salon_admin), mais l'objectif énoncé
-- ("aucune policy ne doit plus dépendre de auth.uid()") l'exigeait : la policy
-- "users_update_self" appelait auth.uid() directement, sans passer par une fonction
-- helper. Fermeture de ce 4e site de dépendance ci-dessous.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- is_salon_admin() / is_owner() — lisent app.role au lieu de relire le rôle en base.
-- coalesce(..., '') = 'x' : renvoie explicitement FALSE (jamais NULL) si la variable
-- n'est pas positionnée — comparaison de texte, sans dépendance au type enum user_role
-- (encore une dépendance en moins à un choix de modélisation antérieur).
-- ---------------------------------------------------------------------------
create or replace function public.is_salon_admin()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.role', true), '') = 'salon_admin'
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.role', true), '') = 'owner'
$$;

-- ---------------------------------------------------------------------------
-- users_update_self — remplace l'appel direct à auth.uid() par current_user_id(), pour
-- que plus aucune policy du projet ne dépende directement de Supabase Auth.
-- ---------------------------------------------------------------------------
alter policy "users_update_self" on "users"
  using (id = public.current_user_id() and not is_deleted)
  with check (id = public.current_user_id());
