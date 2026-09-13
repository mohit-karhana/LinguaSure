#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker first. See the EC2 section in README.md."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Install the Docker Compose plugin first. See the EC2 section in README.md."
  exit 1
fi

if [ ! -f .env ]; then
  echo "Create .env from .env.example and set OPENAI_API_KEY, GOOGLE_CLIENT_ID, and SESSION_SECRET."
  exit 1
fi

if [ -n "${DOMAIN:-}" ] || grep -q '^DOMAIN=.\+' .env 2>/dev/null; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
else
  docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build
fi

docker compose ps
echo
echo "App is up. Open http://localhost:3000 on this machine, or your public HTTPS domain."
