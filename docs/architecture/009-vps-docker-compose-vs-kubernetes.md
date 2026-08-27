# 009 — VPS + Docker Compose plutôt que Kubernetes

## Statut

Décidé et implémenté le 2026-08-21 : migration de core-api de Vercel vers un déploiement
Docker (voir `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy.yml`).

## Contexte

LBZ passe d'un hébergement Vercel (PaaS géré) à un déploiement conteneurisé, pour
préparer l'arrivée d'un second service (`whatsapp-agent`, Étape 6) qui doit tourner à
côté de `core-api` et communiquer avec lui sans passer par l'internet public. Deux
options structurantes se présentaient : un cluster Kubernetes, ou un VPS unique avec
Docker Compose.

## Décision

VPS + Docker Compose, pas Kubernetes, à ce stade.

## Pourquoi

- **Échelle actuelle : deux services, un salon-SaaS en phase de démarrage.** Kubernetes
  résout des problèmes (orchestration multi-nœuds, bin-packing, auto-scaling horizontal
  fin, rolling updates sans downtime sur des dizaines de pods) que ce projet n'a pas
  encore. Avec `core-api` + (bientôt) `whatsapp-agent`, un seul hôte suffit largement.
- **Coût opérationnel disproportionné.** Un cluster Kubernetes correctement opéré
  implique : plan de contrôle (managé ou non), gestion des secrets (Sealed Secrets /
  Vault), ingress controller, observabilité (métriques + logs centralisés), politiques
  RBAC, mises à jour de version du cluster lui-même. Toute cette surface est à maintenir
  même pour deux conteneurs — un coût d'équipe (actuellement solo/très petite équipe) qui
  ne se justifie pas encore.
- **Docker Compose est déjà suffisant pour ce qu'on demande à l'infra aujourd'hui** :
  démarrer/arrêter un petit nombre de services connus à l'avance, les faire communiquer
  sur un réseau privé nommé (`lbz-internal`, voir `docker-compose.yml`), exposer un seul
  point d'entrée public via nginx. `docker compose pull && up -d` est un déploiement
  reproductible, lisible par une seule personne, sans machinerie supplémentaire.
- **Rollback trivial.** Chaque image poussée sur GHCR est taggée par commit SHA en plus
  de `latest` (voir `.github/workflows/deploy.yml`) — revenir en arrière, c'est changer
  un tag et relancer `docker compose up -d`, pas gérer un historique de déploiements
  Kubernetes.
- **Portabilité conservée.** Les images restent des images Docker standard. Rien dans ce
  choix n'empêche une migration future vers Kubernetes (ou un PaaS type Fly.io/Render) —
  le `Dockerfile` ne change pas, seule la couche d'orchestration changerait.

## Ce qui déclencherait une révision de cette décision

- Plus d'un hôte nécessaire (charge, disponibilité géographique, isolation
  client-par-client) — Docker Compose ne coordonne pas plusieurs machines.
- Besoin de scaling horizontal automatique par service (ex. pics de charge WhatsApp
  imprévisibles) au-delà de ce qu'un `docker compose up --scale` manuel sur un seul hôte
  peut couvrir.
- Plus de 4-5 services indépendants avec des cycles de déploiement propres — au-delà,
  la coordination manuelle des dépendances entre services dans un seul
  `docker-compose.yml` devient elle-même une source d'erreurs.
- Une équipe dédiée à l'infrastructure capable d'opérer Kubernetes en continu.

Tant qu'aucun de ces déclencheurs n'est atteint, le VPS + Docker Compose reste le bon
niveau d'investissement.

## Conséquences pratiques

- Un seul VPS héberge `nginx` (point d'entrée public, port 80/443) + `core-api`, et
  plus tard `whatsapp-agent` — tous sur le réseau Docker `lbz-internal`.
- Le déploiement est piloté par CI/CD (GitHub Actions, voir
  `.github/workflows/deploy.yml`) : build + push de l'image sur GHCR, puis SSH vers le
  VPS pour `docker compose pull && docker compose up -d`. Les secrets requis
  (`VPS_HOST`, `VPS_SSH_KEY`, ...) sont documentés en tête de ce workflow — ils
  n'existent pas encore côté GitHub au moment de cette tâche, le job de déploiement est
  donc conditionné à leur présence pour ne pas casser le pipeline avant leur création.
- Supabase reste géré séparément (voir
  [[010-supabase-managed-hors-docker-compose]]) : le VPS n'héberge pas de base de
  données.
