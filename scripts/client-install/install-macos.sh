#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.client.local"
COMPOSE_FILE="docker-compose.client.yml"
DEFAULT_IMAGE_ROOT="ghcr.io/lebaleze22/lbz-saluni"
DEFAULT_VERSION="edge"
if [[ -s SALUNI_VERSION ]]; then
  DEFAULT_VERSION="$(tr -d '[:space:]' < SALUNI_VERSION)"
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker est introuvable. Installez et démarrez Docker Desktop for Mac." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "Le moteur Docker n'est pas prêt. Démarrez Docker Desktop puis réessayez." >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl est requis pour générer les secrets locaux." >&2
  exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  image_root="${SALUNI_IMAGE_ROOT:-$DEFAULT_IMAGE_ROOT}"
  version="${SALUNI_VERSION:-$DEFAULT_VERSION}"
  http_port="${SALUNI_HTTP_PORT:-54321}"
  tooling_image="$image_root/tooling:$version"

  echo "Téléchargement de l'image d'installation SALUNI..."
  if [[ "${SALUNI_SKIP_PULL:-0}" == "1" ]]; then
    docker image inspect "$tooling_image" >/dev/null
  else
    if ! docker pull "$tooling_image"; then
      echo "Impossible de télécharger $tooling_image." >&2
      echo "Si le package GHCR est privé, exécutez d'abord: docker login ghcr.io" >&2
      exit 1
    fi
  fi

  postgres_password="$(openssl rand -hex 32)"
  runtime_password="$(openssl rand -hex 32)"
  jwt_secret="$(openssl rand -hex 32)"
  key_output="$(docker run --rm -e GOTRUE_JWT_SECRET="$jwt_secret" "$tooling_image" \
    node scripts/local-stack/generate-jwt-keys.mjs)"
  anon_key="$(printf '%s\n' "$key_output" | sed -n 's/^NEXT_PUBLIC_SUPABASE_ANON_KEY=//p')"
  service_key="$(printf '%s\n' "$key_output" | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')"

  if [[ -z "$anon_key" || -z "$service_key" ]]; then
    echo "La génération des clés Auth a échoué." >&2
    exit 1
  fi

  umask 077
  cat >"$ENV_FILE" <<EOF
SALUNI_IMAGE_ROOT=$image_root
SALUNI_VERSION=$version
LOCAL_POSTGRES_PASSWORD=$postgres_password
LOCAL_APP_RUNTIME_PASSWORD=$runtime_password
GOTRUE_JWT_SECRET=$jwt_secret
AUTH_JWT_SECRET=$jwt_secret
SUPABASE_ANON_KEY=$anon_key
SUPABASE_SERVICE_ROLE_KEY=$service_key
LOCAL_HTTP_PORT=$http_port
LOCAL_PUBLIC_URL=http://localhost:$http_port
EOF
  chmod 600 "$ENV_FILE"
  unset postgres_password runtime_password jwt_secret key_output anon_key service_key
  echo "Configuration locale créée dans $ENV_FILE."
else
  echo "Configuration existante conservée: $ENV_FILE"
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Téléchargement des images SALUNI..."
if [[ "${SALUNI_SKIP_PULL:-0}" != "1" ]]; then
  compose pull
fi

echo "Démarrage de PostgreSQL et du service Auth..."
compose up -d postgres gotrue

echo "Application des migrations..."
compose run --rm -T tooling npx prisma migrate deploy
compose run --rm -T tooling node scripts/local-stack/set-app-runtime-password.mjs

echo "Démarrage de SALUNI..."
compose up -d core-api nginx

public_url="$(sed -n 's/^LOCAL_PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
healthcheck_url="${SALUNI_HEALTHCHECK_URL:-$public_url}"
for _ in $(seq 1 60); do
  if curl --silent --fail "$healthcheck_url/auth/v1/health" >/dev/null 2>&1 && \
    curl --silent --fail "$healthcheck_url/login" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl --silent --fail "$healthcheck_url/auth/v1/health" >/dev/null
curl --silent --fail "$healthcheck_url/login" >/dev/null

default_tenant="Caprice D'Ebène"
if [[ "${SALUNI_NON_INTERACTIVE:-0}" == "1" ]]; then
  tenant_name="${CLIENT_TENANT_NAME:-$default_tenant}"
  owner_name="${CLIENT_OWNER_NAME:-}"
  owner_email="${CLIENT_OWNER_EMAIL:-}"
  owner_password="${CLIENT_OWNER_PASSWORD:-}"
  owner_password_confirmation="$owner_password"
else
  read -r -p "Nom du salon [$default_tenant]: " tenant_name
  tenant_name="${tenant_name:-$default_tenant}"
  read -r -p "Nom complet de l'Owner: " owner_name
  read -r -p "E-mail de l'Owner: " owner_email
  read -r -s -p "Mot de passe Owner (14 caractères minimum): " owner_password
  printf '\n'
  read -r -s -p "Confirmez le mot de passe Owner: " owner_password_confirmation
  printf '\n'
fi

if [[ -z "$owner_name" || -z "$owner_email" ]]; then
  echo "Le nom et l'e-mail de l'Owner sont requis." >&2
  exit 1
fi
if [[ "$owner_password" != "$owner_password_confirmation" ]]; then
  echo "Les mots de passe Owner ne correspondent pas." >&2
  exit 1
fi
if [[ ${#owner_password} -lt 14 ]]; then
  echo "Le mot de passe Owner doit contenir au moins 14 caractères." >&2
  exit 1
fi

export CLIENT_TENANT_NAME="$tenant_name"
export CLIENT_OWNER_NAME="$owner_name"
export CLIENT_OWNER_EMAIL="$owner_email"
export CLIENT_OWNER_PASSWORD="$owner_password"

echo "Création du tenant et de l'Owner..."
compose run --rm -T \
  -e CLIENT_TENANT_NAME -e CLIENT_OWNER_NAME -e CLIENT_OWNER_EMAIL -e CLIENT_OWNER_PASSWORD \
  tooling node scripts/initialize-client.mjs

unset CLIENT_OWNER_PASSWORD owner_password owner_password_confirmation

echo "Import des 5 postes, 11 catégories et 81 prestations..."
compose run --rm -T -e CLIENT_TENANT_NAME tooling node scripts/import-catalogue-caprice.mjs

echo "Vérification de l'état initial..."
compose run --rm -T -e CLIENT_TENANT_NAME tooling node scripts/verify-client-installation.mjs

unset CLIENT_TENANT_NAME CLIENT_OWNER_NAME CLIENT_OWNER_EMAIL tenant_name owner_name owner_email

compose ps
echo
echo "SALUNI est prêt: $public_url/login"
echo "Le Director et les autres membres du staff doivent maintenant être créés par l'Owner dans l'interface."
