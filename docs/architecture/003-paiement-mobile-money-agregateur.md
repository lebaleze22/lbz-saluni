# 003 — Mobile Money : agrégateur uniquement, jamais d'API opérateur directe

## Contexte

Le marché camerounais du paiement mobile repose sur deux opérateurs (Orange Money,
MTN MoMo) dont les API directes sont instables, faiblement documentées côté intégrateurs
tiers, et demandent des accords commerciaux séparés par opérateur. La convention du
projet impose de passer exclusivement par un agrégateur (CinetPay ou NotchPay), jamais
par une intégration directe à l'API d'un opérateur.

## Décision — portée de l'Étape 1

L'Étape 1 est un registre d'activité **manuel** : le gérant saisit un paiement déjà
encaissé (espèces, Orange Money, MTN MoMo remis en main propre ou reçu hors app), il n'y
a **aucun paiement en ligne déclenché depuis l'application**. En conséquence :

- `payments.method` est un enum déclaratif (`cash`, `orange_money`, `mtn_momo`) qui
  décrit _comment le client a payé_, pas une intégration technique.
- Aucune clé d'API d'agrégateur, aucun webhook, aucun SDK CinetPay/NotchPay n'est
  introduit dans ce scaffold.

## Décision — portée future

Le jour où LBZ déclenche un paiement en ligne (ex. acompte de réservation publique,
paiement à distance), l'intégration devra passer par CinetPay ou NotchPay exclusivement.
Aucune bibliothèque `orange-money-*` ou `mtn-momo-*` ne doit être ajoutée aux dépendances,
même à titre expérimental — l'agrégateur gère la conformité réglementaire et la relation
contractuelle avec les deux opérateurs, ce que le projet n'a pas vocation à recréer.

## Conséquences

- `lib/` ne contient aucun client de paiement à ce stade.
- Quand cette intégration sera implémentée, elle vivra dans un module dédié
  (ex. `lib/payments/`) avec les clés d'agrégateur en variables d'environnement, jamais
  commitées.
