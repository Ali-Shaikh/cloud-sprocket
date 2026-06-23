#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/defaults.env"
if [[ -f "$ROOT/install.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/install.env"
fi

BASE_URL="${MAGENTO_BASE_URL:-${STOREFRONT_URL:-http://localhost:8080}}"
ADMIN_USER="${MAGENTO_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${MAGENTO_ADMIN_PASSWORD:-Admin123!}"
ADMIN_EMAIL="${MAGENTO_ADMIN_EMAIL:-admin@example.com}"

echo "Official Magento installer: ${MAGENTO_PACKAGE} ${MAGENTO_VERSION} (markshust defaults)"

if [[ ! -f "$ROOT/auth.json" ]]; then
  echo "error: auth.json is missing. Add Adobe Marketplace keys and retry post-apply." >&2
  exit 1
fi

echo "Waiting for phpfpm container..."
ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T phpfpm true 2>/dev/null; then
    ready=1
    break
  fi
  sleep 5
done
if [[ "$ready" -ne 1 ]]; then
  echo "error: phpfpm container did not become ready" >&2
  exit 1
fi

if docker compose exec -T phpfpm test -f /var/www/html/app/etc/env.php 2>/dev/null; then
  echo "Magento already installed; skipping setup."
  exit 0
fi

docker compose exec -T phpfpm mkdir -p /var/www/.composer
docker compose cp "$ROOT/auth.json" phpfpm:/var/www/.composer/auth.json

echo "Downloading Magento source via Composer..."
docker compose exec -T phpfpm bash -lc "
  set -euo pipefail
  export COMPOSER_HOME=/var/www/.composer
  mkdir -p /var/www/html
  cd /var/www/html
  if [[ ! -f bin/magento ]]; then
    composer create-project --no-interaction --repository-url=https://repo.magento.com/ \
      ${MAGENTO_PACKAGE} . ${MAGENTO_VERSION}
  fi
"

echo "Running setup:install..."
docker compose exec -T phpfpm bash -lc "
  set -euo pipefail
  cd /var/www/html
  php bin/magento setup:install \
    --base-url='${BASE_URL}/' \
    --db-host=db \
    --db-name=magento \
    --db-user=magento \
    --db-password=magento \
    --admin-firstname=Admin \
    --admin-lastname=User \
    --admin-email='${ADMIN_EMAIL}' \
    --admin-user='${ADMIN_USER}' \
    --admin-password='${ADMIN_PASSWORD}' \
    --language=en_US \
    --currency=USD \
    --timezone=America/New_York \
    --use-rewrites=1 \
    --search-engine=opensearch \
    --opensearch-host=opensearch \
    --opensearch-port=9200 \
    --session-save=redis \
    --session-save-redis-host=redis \
    --session-save-redis-port=6379 \
    --cache-backend=redis \
    --cache-backend-redis-server=redis \
    --cache-backend-redis-port=6379 \
    --page-cache=redis \
    --page-cache-redis-server=redis \
    --page-cache-redis-port=6379 \
    --amqp-host=rabbitmq \
    --amqp-port=5672 \
    --amqp-user=magento \
    --amqp-password=magento
"

echo "Magento official stack is ready at ${BASE_URL}"