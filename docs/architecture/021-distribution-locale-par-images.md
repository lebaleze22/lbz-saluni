# 021 — Distribution locale par images versionnées

## Statut

Acceptée et vérifiée sur une base PostgreSQL 16 vierge le 2026-09-01.

## Contexte

L'installation chez le client doit être reproductible sur Mac Intel ou Apple Silicon,
sans compiler SALUNI ni installer Node.js, PostgreSQL ou Supabase CLI. Le contenu initial
doit être strictement contrôlé : un salon, un Owner utilisable, le catalogue réel, puis
aucune donnée opérationnelle fictive.

Cette décision complète et remplace les sections de l'ADR 017 qui imposaient une copie
du dépôt, un build local et des seeds Director/Owner séparés.

## Décision

- GitHub Actions construit et publie quatre images GHCR multi-architecture et
  versionnées : `core-api`, `tooling`, `postgres` et `nginx`.
- GoTrue reste épinglé sur son image officielle dans Compose.
- Une release contient un petit paquet macOS avec Compose, les scripts d'installation et
  de mise à jour, la version d'images et ce guide. Le code source n'est pas requis sur le
  Mac client.
- La configuration Auth publique est injectée au rendu depuis les variables d'exécution.
  Une même image `core-api` peut donc être utilisée avec les secrets et le port propres à
  chaque Mac ; aucune clé client n'est figée pendant le build.
- Le projet Compose porte le nom explicite `saluni-client`, et ses conteneurs, son réseau
  et son volume sont distincts de toute stack de développement.
- L'installateur génère les secrets, applique les migrations, configure `app_runtime`,
  crée un tenant et un Owner lié à un profil Staff, vérifie sa connexion par mot de passe,
  importe 5 postes, 11 catégories et 81 prestations, puis vérifie les compteurs.
- Aucun Director n'est préconfiguré. L'Owner crée le Director et les autres membres du
  staff sur place via l'UI.

## État initial garanti

| Donnée                                |                     Nombre |
| ------------------------------------- | -------------------------: |
| Tenant actif                          |                          1 |
| Owner                                 |                          1 |
| Director (`salon_admin`)              |                          0 |
| Profils Staff                         | 1 (profil technique Owner) |
| Postes                                |                          5 |
| Catégories                            |                         11 |
| Prestations                           |                         81 |
| Clients, visites, paiements, dépenses |                          0 |

## Conséquences

- Une connexion Internet est requise pour installer et mettre à jour, mais pas pour
  l'utilisation quotidienne après téléchargement des images.
- Les données persistent dans le volume `saluni-client-postgres-data`, indépendamment du
  cycle de vie des images.
- Une mise à jour change le tag versionné, tire les images et applique les migrations ;
  elle ne réinitialise jamais la base.
- Les packages GHCR doivent être publics ou le Mac doit recevoir un accès technique
  limité à `read:packages`.
- La publication HTTP reste limitée à `127.0.0.1` et n'est pas destinée à une exposition
  réseau ou Internet.

## Vérification

- Build `core-api` sans variable Auth publique de build : réussi.
- Build local des quatre images de release : réussi.
- Syntaxe Bash 5.2 et configuration Compose : réussies.
- Installation dans une stack QA et un volume dédiés : 24 migrations appliquées.
- Connexion réelle de l'Owner par `signInWithPassword` : réussie.
- Vérification stricte de l'état initial : 1/1/0/1/5/11/81 et toutes les données
  opérationnelles à zéro.
