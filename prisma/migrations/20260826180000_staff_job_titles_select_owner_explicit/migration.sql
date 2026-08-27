-- Rend explicite l'accès en lecture d'Owner sur staff/job_titles.
--
-- Vérifié directement via pg_policies avant cette migration : "staff_select_tenant" et
-- "job_titles_select_tenant" ne testaient QUE is_salon_admin() dans leur USING. Owner
-- avait malgré tout accès en lecture aujourd'hui, mais uniquement par un effet indirect :
-- "staff_write_admin"/"job_titles_write_admin" sont des policies FOR ALL (donc
-- applicables aussi aux commandes SELECT), et PostgreSQL combine par OR tous les USING
-- des policies permissives applicables à une commande donnée. L'accès lecture d'Owner
-- dépendait donc entièrement de ce que write_admin reste une policy FOR ALL — un lien
-- implicite entre deux policies distinctes, jamais écrit noir sur blanc dans la policy de
-- lecture elle-même.
--
-- Ce n'était pas un problème observable jusqu'ici : le rôle Postgres utilisé par
-- l'application (DATABASE_URL) a BYPASSRLS, donc aucune policy RLS — correcte ou non —
-- n'a d'effet sur ce qu'il voit (voir docs/architecture/014-decouplage-rls-auth-provider.md).
-- Une fois RLS réellement appliqué (rôle applicatif restreint, FORCE ROW LEVEL SECURITY —
-- voir la suite de cette même tâche), un futur refactor de write_admin (ex. le scinder en
-- policies INSERT/UPDATE/DELETE séparées, chacune sans portée SELECT) ferait perdre à
-- Owner son accès en lecture silencieusement, sans qu'aucun test ne l'indique clairement
-- si ce test n'exerce pas spécifiquement ce chemin. Corrigé maintenant, avant que RLS ne
-- devienne actif pour de vrai, en rendant l'accès lecture d'Owner explicite dans la
-- policy de lecture elle-même — indépendant de la forme que prendra write_admin à l'avenir.
alter policy "staff_select_tenant" on "staff"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "job_titles_select_tenant" on "job_titles"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);
