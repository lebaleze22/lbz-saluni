# Étape 1 — Registre d'activité (journal de caisse digital)

**Statut :** spécifié, prêt pour implémentation
**Priorité :** #1 — remplace directement le cahier papier de Caprice D'Ebène
**Projet :** LBZ (LEBALEZE) — plateforme SaaS multi-salons

---

## Objectif

Digitaliser le suivi quotidien de l'activité du salon : qui a fait quoi, pour quel client,
à quelle heure, si c'était une réservation ou un passage, et combien a été payé.
C'est la brique de valeur immédiate, avant tout calendrier ou réservation publique.

## Rôle et accès

- **Un seul rôle habilité à saisir** : le directeur/gérant du salon (`users.role = salon_admin`).
- Les membres du staff (`staff`) n'ont **pas de compte**, pas de login, pas d'accès à l'application.
  Ils existent uniquement comme référence (nom, taux de commission) sélectionnable dans le formulaire.
- Cette restriction s'applique pour le MVP. Les rôles `manager` / `staff` du modèle de données
  restent réservés pour une évolution future (ex. staff consultant son propre planning).

## Client — saisie à la volée

- **Nom** : champ texte libre, requis.
- **Téléphone** : optionnel, ne bloque jamais la saisie.
- Autocomplete sur `clients.name` existants pour limiter les doublons, sans les empêcher.
- Compromis assumé : deux clients homonymes sans téléphone ne sont pas fiablement dédupables.
  Acceptable à l'échelle d'un salon avec une équipe qui connaît ses habitués.
- Un client arrivant via l'assistant WhatsApp (étape future) capture automatiquement son numéro,
  donc la base de clients s'enrichit naturellement dans le temps.

## Formulaire de saisie rapide

Un enregistrement = une visite, avec une ou plusieurs prestations.

| Champ                  | Table / source                      | Détail                                                                                     |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Client                 | `clients`                           | Nom libre + autocomplete, téléphone optionnel                                              |
| Staff                  | `staff`                             | Qui a réalisé la prestation (dropdown)                                                     |
| Service(s)             | `services` → `appointment_services` | Un ou plusieurs par visite, **chacun avec son propre prix**                                |
| Réservation ou passage | `appointments.source`               | Toggle `reservation` / `walk_in`                                                           |
| Heure                  | `appointments.start_time`           | Horodatage auto, modifiable (saisie a posteriori possible)                                 |
| Paiement               | `payments`                          | Montant total (= somme des lignes de service), méthode (espèces / Orange Money / MTN MoMo) |

> Le prix par service (et non un prix unique par visite) est ce qui permet ensuite les rapports
> par type de prestation (ex. "la coloration a rapporté X ce mois-ci").

## Vue registre du jour

- Liste chronologique de toutes les prestations de la journée.
- Filtrable par staff et par date.
- Équivalent direct du cahier papier existant, sous forme digitale.

## Rapports et comptabilité

Construits par agrégation directe sur les données du registre — pas de module séparé.

- **Périodes** : hebdomadaire, mensuel, trimestriel.
- **Chiffre d'affaires total**, ventilé par méthode de paiement.
- **Répartition par staff** — base directe pour le calcul futur des commissions.
- **Répartition par service** — quelle prestation rapporte le plus.
- **Volume** — nombre de prestations, nouveaux clients vs récurrents.

### Export — les deux formats dès le départ

| Format            | Usage                                                      | Approche technique                                                                                                  |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **PDF**           | Rapport lisible, à remettre tel quel (comptable, archives) | Génération serveur avec `pdf-lib` ou `@react-pdf/renderer` — éviter Puppeteer/Chrome headless sur Vercel serverless |
| **Excel (.xlsx)** | Données brutes exploitables, une ligne par prestation      | `SheetJS` (xlsx)                                                                                                    |

Les deux exports consomment la même requête d'agrégation que la vue à l'écran —
pas de logique de reporting dupliquée.

## Ce que cette étape n'inclut pas (volontairement, reporté)

- Calendrier planifié / vue par créneaux
- Page de réservation publique
- Décrément automatique du stock
- Assistant WhatsApp IA
- Multi-tenant (routing par sous-domaine, onboarding self-service)

---

_Document de travail — à faire évoluer à chaque étape suivante du projet._
