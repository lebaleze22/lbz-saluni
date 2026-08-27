-- AlterEnum
-- Ajoute la valeur 'owner' à l'enum user_role (cf. docs/architecture/012-role-owner.md).
--
-- Migration isolée à dessein : PostgreSQL interdit d'utiliser une valeur d'enum tout
-- juste ajoutée (ALTER TYPE ... ADD VALUE) dans la MÊME transaction que celle qui l'a
-- ajoutée ("unsafe use of new value of enum type"). `prisma migrate deploy` exécute
-- chaque dossier de migration dans sa propre transaction : la fonction is_owner() et les
-- index uniques qui référencent 'owner'::user_role vivent donc dans la migration
-- suivante (20260826140100_owner_role_rls), jamais dans celle-ci.
ALTER TYPE "user_role" ADD VALUE 'owner';
