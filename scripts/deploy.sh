#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Deploy BoraMarcar API em $APP_DIR"

if [[ ! -f .env ]]; then
  echo "ERRO: arquivo .env não encontrado em $APP_DIR"
  echo "Crie o .env na EC2 antes do primeiro deploy (copie de .env.example)."
  exit 1
fi

echo "==> Atualizando código..."
git fetch origin master
git reset --hard origin/master

echo "==> Instalando dependências..."
npm ci

echo "==> Build..."
npm run build

echo "==> Reiniciando PM2..."
if pm2 describe boramarcar-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo "==> Deploy concluído."
pm2 status boramarcar-api
