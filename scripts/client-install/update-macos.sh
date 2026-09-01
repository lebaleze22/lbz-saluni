#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.client.local"
COMPOSE_FILE="docker-compose.client.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE est absent. Exécutez d'abord scripts/client-install/install-macos.sh." >&2
  exit 1
fi

requested_version="${1:-}"
if [[ -n "$requested_version" ]]; then
  if [[ ! "$requested_version" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Version invalide: $requested_version" >&2
    exit 1
  fi
  temporary_env="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v version="$requested_version" '
    BEGIN { replaced = 0 }
    /^SALUNI_VERSION=/ { print "SALUNI_VERSION=" version; replaced = 1; next }
    { print }
    END { if (!replaced) print "SALUNI_VERSION=" version }
  ' "$ENV_FILE" > "$temporary_env"
  chmod 600 "$temporary_env"
  mv "$temporary_env" "$ENV_FILE"
  echo "Version SALUNI sélectionnée: $requested_version"
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Téléchargement de la version configurée..."
compose pull
compose up -d postgres gotrue

echo "Application des nouvelles migrations..."
compose run --rm -T tooling npx prisma migrate deploy
compose run --rm -T tooling node scripts/local-stack/set-app-runtime-password.mjs

echo "Redémarrage contrôlé de SALUNI..."
compose up -d --remove-orphans core-api nginx
compose ps

public_url="$(sed -n 's/^LOCAL_PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
echo "Mise à jour terminée: $public_url/login"
