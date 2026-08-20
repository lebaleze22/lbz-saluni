# 004 — `staff` est une table de référence, pas un compte utilisateur

## Contexte

`Etape_01_Registre_Activite.md` distingue explicitement deux notions qui pourraient être
confondues :

- `users` : comptes applicatifs (login, mot de passe géré par Supabase Auth).
- `staff` : membres de l'équipe du salon (coiffeuses, esthéticiennes...) qui réalisent
  les prestations mais **n'ont pas de compte** au MVP — ils sont seulement une donnée de
  référence (nom, taux de commission) sélectionnable dans le formulaire de saisie.

## Décision

- `staff` n'a **aucune** relation vers `auth.users` ni vers `users` — ce n'est pas un
  rôle applicatif, c'est une entité métier au même titre que `Client` ou `Service`.
- Le champ `users.role` (enum `salon_admin` / `manager` / `staff`) existe dans le modèle
  de données mais **seul `salon_admin` est utilisé à l'Étape 1**. `manager` et `staff`
  sont réservés pour une évolution future (ex. un membre du staff consultant son propre
  planning avec son propre login) — les policies RLS correspondantes existent déjà pour
  la lecture, mais aucune UI ni logique ne doit les exposer avant que cette évolution
  soit spécifiée.
- `Staff.commissionRate` est un champ `Decimal?` optionnel : posé dès l'Étape 1 pour
  éviter une migration future, mais son usage (calcul de commissions) n'est pas
  implémenté ici.

## Conséquences

- Ne pas créer de flux d'invitation/login pour les entrées `staff`.
- Toute future fonctionnalité de connexion staff nécessitera de relier une entrée
  `staff` à une entrée `users` (probablement une FK optionnelle `staff.user_id`), pas de
  transformer `staff` en compte directement.
