#!/usr/bin/env bash
set -euo pipefail

DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
PM2_APP_NAME="${PM2_APP_NAME:-boramarcar-api}"
PM2_ECOSYSTEM="${PM2_ECOSYSTEM:-ecosystem.config.cjs}"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Deploy BoraMarcar API ($PM2_APP_NAME) em $APP_DIR"
echo "==> Branch: $DEPLOY_BRANCH"

if [[ ! -f .env ]]; then
  echo "ERRO: arquivo .env não encontrado em $APP_DIR"
  echo "Crie o .env na EC2 antes do primeiro deploy (copie de .env.example)."
  exit 1
fi

if [[ ! -f "$PM2_ECOSYSTEM" ]]; then
  echo "ERRO: $PM2_ECOSYSTEM não encontrado em $APP_DIR"
  exit 1
fi

echo "==> Atualizando código..."
git fetch origin "$DEPLOY_BRANCH"
git reset --hard "origin/$DEPLOY_BRANCH"

echo "==> Instalando dependências..."
npm ci

echo "==> Build..."
npm run build

echo "==> Reiniciando PM2 ($PM2_APP_NAME)..."
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$PM2_ECOSYSTEM" --update-env
else
  pm2 start "$PM2_ECOSYSTEM"
fi

pm2 save

echo "==> Deploy concluído."
pm2 status "$PM2_APP_NAME"
