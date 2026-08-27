# 011 — Authentification inter-services : whatsapp-agent -> core-api

## Statut

Décision de conception prise le 2026-08-21, en préparation de l'Étape 6
(`whatsapp-agent`), dans le cadre de la migration de `core-api` vers Docker (voir
[[009-vps-docker-compose-vs-kubernetes]]). **`whatsapp-agent` n'est pas créé par cette
tâche** — ce document fixe le pattern d'authentification à implémenter au moment de sa
création, pour que le réseau Docker et nginx soient déjà structurés en conséquence
aujourd'hui (voir `docker-compose.yml`, `nginx/default.conf`) sans reconfiguration à ce
moment-là.

## Contexte

`whatsapp-agent` (Étape 6) recevra des webhooks WhatsApp (via nginx, route
`/webhooks/whatsapp`, actuellement commentée dans `nginx/default.conf`) et devra
ensuite appeler `core-api` pour lire/écrire des données métier (ex. créer un rendez-vous
à partir d'un message). Cet appel `whatsapp-agent -> core-api` a besoin d'être
authentifié : `core-api` doit pouvoir distinguer un appel légitime de `whatsapp-agent`
de n'importe quelle autre requête.

Ce n'est **pas** la même question que l'authentification utilisateur (Supabase Auth,
JWT `authenticated`, RLS — voir [[001-tenant-id-et-rls]]) : `whatsapp-agent` n'agit pas
au nom d'un utilisateur Supabase connecté, c'est un service applicatif qui parle à un
autre service applicatif.

## Décision

**Secret partagé transmis en header**, validé par un middleware dédié sur des routes
`core-api` explicitement internes (ex. préfixe `/internal/*`), le tout circulant
uniquement sur le réseau Docker privé `lbz-internal` — jamais exposé publiquement.

```
whatsapp-agent  --  POST http://core-api:3000/internal/appointments
                     Header: X-Internal-Service-Token: <secret partagé>
                --> core-api vérifie le header avant de traiter la requête
```

## Pourquoi ce choix, plutôt que les alternatives

- **mTLS (certificats client)** : le niveau de garantie le plus fort, mais une
  complexité opérationnelle (émission, rotation, révocation de certificats) hors de
  proportion pour deux conteneurs qui se parlent sur un réseau Docker privé à
  l'intérieur d'un seul VPS — personne d'autre que ces deux conteneurs n'a accès à ce
  réseau (voir "Pourquoi le réseau privé suffit" ci-dessous).
- **JWT signé (service-to-service)** : apporte expiration + claims structurés, utile si
  plusieurs services internes avec des permissions différenciées apparaissent. Pour
  UN seul appelant (`whatsapp-agent`) vers UNE seule cible (`core-api`), c'est de la
  machinerie (émission, vérification de signature, horloge synchronisée) sans bénéfice
  proportionné aujourd'hui. Le pattern reste migrable vers un JWT signé plus tard si le
  nombre de services internes augmente, sans changer la structure réseau posée ici.
- **Secret partagé en header** : le plus simple des trois à implémenter et à opérer —
  une variable d'environnement de chaque côté (`INTERNAL_SERVICE_TOKEN`), comparée en
  temps constant côté `core-api`. Suffisant parce que la vraie barrière de sécurité
  n'est pas le secret lui-même, mais l'isolation réseau (point suivant).

### Pourquoi le réseau privé fait l'essentiel du travail

Dans `docker-compose.yml`, seul `nginx` publie un port sur l'hôte (`80:80`). `core-api`
et (plus tard) `whatsapp-agent` communiquent entre eux via le réseau Docker nommé
`lbz-internal`, qui n'est **routable depuis nulle part en dehors du VPS** — pas
d'exposition publique, pas de port mappé vers l'hôte pour ces services. Un attaquant qui
n'a pas déjà compromis le VPS lui-même ne peut pas atteindre `core-api` directement pour
tenter de deviner le secret partagé ; le seul chemin public reste nginx, qui ne route
que vers les endpoints prévus (`/`, et plus tard `/webhooks/whatsapp` vers
`whatsapp-agent`, jamais vers `/internal/*`). Le secret partagé est donc une deuxième
barrière, pas la seule — cohérent avec le niveau de risque réel.

## Ce qui reste à faire à la création de whatsapp-agent (Étape 6, hors scope ici)

- Générer et distribuer `INTERNAL_SERVICE_TOKEN` (un secret aléatoire suffisamment
  long) dans les `.env` respectifs des deux services — jamais commité, jamais dans
  l'image Docker (même logique que `SUPABASE_SERVICE_ROLE_KEY`, voir
  [[010-supabase-managed-hors-docker-compose]]).
- Implémenter, côté `core-api`, un middleware qui rejette (401) toute requête sur
  `/internal/*` sans le header `X-Internal-Service-Token` correct — comparaison en
  temps constant pour éviter les attaques par timing.
- S'assurer qu'nginx ne route **jamais** de trafic public vers `/internal/*` (aucun
  bloc `location` prévu pour ce préfixe dans `nginx/default.conf` — volontaire).
- Décommenter le bloc `whatsapp-agent` dans `docker-compose.yml` et le bloc
  `/webhooks/whatsapp` dans `nginx/default.conf`.

## Ce qui déclencherait une révision de cette décision

- Plus d'un service interne appelant `core-api`, avec des permissions différenciées par
  appelant — passer à un JWT signé avec claims (`iss`, `scope`) deviendrait justifié.
- `whatsapp-agent` déployé sur un hôte différent de celui de `core-api` (le réseau
  Docker privé ne suffirait plus à isoler le trafic — il faudrait alors un VPN entre
  hôtes ou du mTLS).
