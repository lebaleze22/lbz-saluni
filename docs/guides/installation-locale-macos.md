# Installer SALUNI en local sur un Mac

Ce guide décrit le déploiement recommandé chez le client : le Mac télécharge des images
Docker déjà construites depuis GHCR, puis Docker Compose démarre PostgreSQL 16, GoTrue
(Supabase Auth), SALUNI et nginx. Aucun build, Node.js, PostgreSQL local ou dépôt Git n'est
nécessaire sur le Mac du salon.

SALUNI est ensuite disponible uniquement sur le Mac à l'adresse
`http://localhost:54321`. Le port PostgreSQL n'est pas publié.

## État créé à la première installation

L'installateur crée exactement :

- un tenant, `Caprice D'Ebène` par défaut ;
- un compte Owner dont l'e-mail et le mot de passe sont choisis pendant l'installation ;
- un profil Staff technique actif lié à cet Owner, nécessaire au garde d'accès ;
- 5 postes, 11 catégories et 81 prestations du catalogue Caprice D'Ebène.

Il ne crée aucun Director, aucun autre membre du staff, aucun client, aucune visite, aucun
paiement et aucune dépense. Le premier Director et le reste de l'équipe sont créés sur
place par l'Owner dans l'interface.

## 1. Prérequis macOS

- Mac Intel ou Apple Silicon ; 8 Go de RAM minimum recommandés.
- Une version de macOS encore prise en charge par Docker Desktop.
- Environ 10 Go d'espace libre pour Docker, les images, la base et les sauvegardes.
- Une connexion Internet pendant l'installation et les mises à jour.
- Docker Desktop for Mac, choisi selon le processeur du Mac.
- Le paquet d'installation `saluni-client-<version>.tar.gz` correspondant à la version à
  installer.

Installez [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/),
lancez-le et attendez l'état « Engine running ». Docker Desktop contient déjà Docker
Engine et Docker Compose. Les images SALUNI sont publiées pour `amd64` et `arm64` ;
n'ajoutez pas de directive `platform`.

Vérifiez dans Terminal.app :

```zsh
docker version
docker compose version
```

Node.js, npm, PostgreSQL et Supabase CLI ne sont pas requis sur le Mac client.

## 2. Récupérer le paquet d'installation

Téléchargez depuis la release GitHub les deux fichiers de la version retenue :

```text
saluni-client-vX.Y.Z.tar.gz
saluni-client-vX.Y.Z.tar.gz.sha256
```

Placez-les dans `~/Downloads`, vérifiez l'archive puis extrayez-la dans un dossier dédié :

```zsh
cd "$HOME/Downloads"
shasum -a 256 -c saluni-client-vX.Y.Z.tar.gz.sha256
mkdir -p "$HOME/SALUNI"
tar -xzf saluni-client-vX.Y.Z.tar.gz -C "$HOME/SALUNI"
cd "$HOME/SALUNI"
chmod +x scripts/client-install/*.sh
```

Le contrôle doit afficher `OK`. Si ce n'est pas le cas, n'utilisez pas l'archive.

Si les packages GHCR sont publics, aucune connexion au registre n'est nécessaire. S'ils
sont privés, utilisez un compte technique GitHub avec un token limité à `read:packages` :

```zsh
printf '%s' '<TOKEN_GITHUB>' | docker login ghcr.io -u '<UTILISATEUR_GITHUB>' --password-stdin
```

Ne placez pas ce token dans un fichier du dossier SALUNI.

## 3. Première installation

Depuis `~/SALUNI`, lancez une seule commande :

```zsh
./scripts/client-install/install-macos.sh
```

Le script :

1. vérifie Docker et OpenSSL ;
2. télécharge les quatre images SALUNI et l'image officielle GoTrue ;
3. génère des secrets locaux aléatoires dans `.env.client.local` avec des droits `600` ;
4. démarre PostgreSQL et GoTrue ;
5. applique les migrations et configure le rôle PostgreSQL restreint de l'application ;
6. démarre SALUNI et nginx ;
7. demande le nom du salon, le nom, l'e-mail et un mot de passe Owner d'au moins 14
   caractères ;
8. crée l'Owner, vérifie réellement sa connexion, importe le catalogue et contrôle tous
   les compteurs attendus.

Utilisez `Caprice D'Ebène` proposé par défaut, sauf décision explicite de changer le nom.
Enregistrez immédiatement les identifiants Owner dans un gestionnaire de mots de passe.
Le mot de passe n'est pas stocké en clair par SALUNI et n'est pas réaffiché à la fin.

Une installation réussie se termine par :

```text
owners=1, directors=0, staff=1
jobTitles=5, categories=11, services=81
clients=0, appointments=0, payments=0, expenses=0
```

Puis ouvrez :

```zsh
open http://localhost:54321/login
```

Connectez-vous avec l'Owner créé, vérifiez les écrans Équipe, Postes, Prestations,
Registre, Dépenses et Rapports, puis créez le Director et les autres membres du staff
depuis l'interface.

## 4. Utilisation quotidienne

Docker Desktop doit être démarré. Les conteneurs configurés avec `restart:
unless-stopped` redémarrent automatiquement avec Docker Desktop.

État des services :

```zsh
cd "$HOME/SALUNI"
docker compose --env-file .env.client.local -f docker-compose.client.yml ps
```

Démarrage ou réparation de la stack :

```zsh
docker compose --env-file .env.client.local -f docker-compose.client.yml up -d
```

Arrêt sans supprimer les données :

```zsh
docker compose --env-file .env.client.local -f docker-compose.client.yml stop
```

Ne lancez jamais `docker compose down -v` et ne supprimez jamais le volume
`saluni-client-postgres-data` sur une installation réelle : cela détruirait la base.

## 5. Mettre SALUNI à jour

Effectuez d'abord une sauvegarde. Téléchargez le nouveau paquet de release et remplacez
uniquement les fichiers versionnés suivants dans `~/SALUNI` :

```text
docker-compose.client.yml
scripts/client-install/install-macos.sh
scripts/client-install/update-macos.sh
SALUNI_VERSION
```

Ne remplacez et ne partagez jamais `.env.client.local`.

Lancez ensuite la mise à jour avec le tag exact de la release :

```zsh
cd "$HOME/SALUNI"
chmod +x scripts/client-install/*.sh
./scripts/client-install/update-macos.sh vX.Y.Z
```

Le script télécharge les nouvelles images, applique les migrations avant de remplacer
l'application, puis conserve le volume PostgreSQL et toutes les données du salon.

## 6. Sauvegarder PostgreSQL

Le volume Docker est local au Mac ; GitHub et GHCR ne le sauvegardent pas. Créez au
minimum une sauvegarde quotidienne sur un support externe chiffré :

```zsh
mkdir -p "$HOME/SALUNI-backups"
docker exec saluni-client-postgres pg_dump -U postgres -d postgres \
  --format=custom --file=/tmp/saluni.dump
docker cp saluni-client-postgres:/tmp/saluni.dump \
  "$HOME/SALUNI-backups/saluni-$(date +%Y%m%d-%H%M%S).dump"
```

Le dump contient les données métier et les comptes Auth. Il est confidentiel. Testez
périodiquement sa restauration sur une installation séparée avant de considérer la
stratégie de sauvegarde comme opérationnelle.

## 7. Sécurité locale

- L'application écoute sur `127.0.0.1:54321`, donc uniquement sur le Mac.
- Ne configurez aucune redirection du port 54321 sur le routeur du salon.
- Ne commitez, n'envoyez et ne copiez pas `.env.client.local` hors d'un coffre chiffré.
- Créez un compte macOS nominatif protégé par mot de passe et activez FileVault.
- Activez les mises à jour automatiques de macOS et Docker Desktop.
- Le navigateur et le Mac client doivent être considérés comme des composants sensibles,
  car l'application est volontairement déployée sans TLS sur la boucle locale.

## 8. Diagnostic rapide

### Docker ne répond pas

Ouvrez Docker Desktop, attendez « Engine running », puis exécutez `docker version`.

### Le téléchargement GHCR est refusé

Vérifiez le tag de `SALUNI_VERSION` et exécutez `docker login ghcr.io` si les packages
sont privés. Le token GitHub doit avoir uniquement le droit `read:packages`.

### Le port 54321 est déjà utilisé

Avant la toute première installation seulement :

```zsh
SALUNI_HTTP_PORT=54322 ./scripts/client-install/install-macos.sh
```

Le script configure ensemble le port nginx, l'URL de l'application et GoTrue. Sur une
installation déjà utilisée, ne changez pas l'URL sans planifier la suppression des
anciens cookies de session.

### Erreur 400 « Request Header Or Cookie Too Large »

Supprimez uniquement les cookies et données du site `localhost` dans le navigateur,
fermez les anciens onglets SALUNI, puis reconnectez-vous.

### Une page affiche une erreur 500

Collectez les journaux sans afficher `.env.client.local` :

```zsh
docker compose --env-file .env.client.local -f docker-compose.client.yml logs \
  --tail=200 core-api nginx gotrue postgres
```

### La première installation a été interrompue

Relancez simplement `./scripts/client-install/install-macos.sh`. Les migrations,
l'initialisation et l'import sont idempotents. Le script conserve les secrets déjà
créés.

Si et seulement si aucune donnée réelle n'a jamais été saisie, un technicien peut
réinitialiser la stack avec :

```zsh
docker compose --env-file .env.client.local -f docker-compose.client.yml down
docker volume rm saluni-client-postgres-data
rm .env.client.local
```

Ces trois commandes détruisent définitivement la base ciblée ; elles ne constituent pas
une procédure normale de dépannage ou de mise à jour.
