# 002 — Montants stockés en entier (FCFA), jamais en décimal

## Contexte

Le XAF (franc CFA) n'a pas de sous-unité utilisée en pratique — les prix sont toujours
des multiples d'entiers (ex. `5 000 FCFA`, jamais `5 000,50 FCFA`). Le format d'affichage
imposé par le projet est `"12 000 FCFA"` (espace comme séparateur de milliers, suffixe
FCFA visible).

## Décision

- Tous les champs monétaires du schéma (`services.default_price`,
  `appointment_services.price`, `payments.amount`) sont typés `Int` (entier), pas
  `Decimal` ni `Float`.
- Aucun helper de formatage n'est ajouté dans ce scaffold (`lib/`) : la mise en forme
  `"12 000 FCFA"` est une préoccupation d'affichage, donc du ressort des écrans
  (hors scope de cette session — cf. mission : pas de logique métier ni d'écran).
  Elle devra être implémentée comme une fonction pure unique et réutilisée partout où
  un montant est affiché, plutôt que dupliquée écran par écran.

## Pourquoi pas `Decimal` ou `Float`

- `Float` introduit des erreurs d'arrondi binaire inacceptables pour de l'argent.
- `Decimal` est correct mais inutilement complexe (précision/échelle à gérer, sérialisation
  spéciale côté JS) pour une devise qui n'a jamais de partie fractionnaire en usage réel.
- `Int` est le type le plus simple qui représente exactement tous les montants possibles
  et évite toute question d'arrondi en base comme en application.

## Conséquences

- Un montant de `12 000 FCFA` est stocké comme l'entier `12000`.
- Toute future intégration de paiement (agrégateur Mobile Money, cf.
  [[003-paiement-mobile-money-agregateur]]) doit respecter ce même type entier pour les
  montants échangés avec l'API de l'agrégateur.
