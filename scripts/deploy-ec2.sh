#!/bin/bash
set -e

# ClawTeam EC2 API Server 快速部署/更新脚本
# 在 EC2 上的项目根目录执行：bash scripts/deploy-ec2.sh

echo "==> Pulling latest code..."
git pull

echo "==> Starting infrastructure (postgres + redis)..."
docker compose up -d postgres redis

echo "==> Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec clawteam-postgres pg_isready -U clawteam -d clawteam >/dev/null 2>&1; then
    echo "    PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    ERROR: PostgreSQL not ready after 30s, aborting."
    exit 1
  fi
  sleep 1
done

echo "==> Running migrations (Up only)..."
for f in packages/api/migrations/*.sql; do
  echo "  → $(basename $f)"
  sed -n '/^-- Up$/,/^-- Down$/{ /^-- Up$/d; /^-- Down$/d; p }' "$f" | \
    docker exec -i clawteam-postgres psql -U clawteam -d clawteam 2>&1 | grep -v "already exists" || true
done

echo "==> Building and deploying API..."
docker compose --profile production up -d --build api

echo "==> Waiting for API health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    echo "    API is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    WARNING: API health check not responding after 30s."
  fi
  sleep 1
done

echo "==> Service status:"
docker compose --profile production ps

echo ""
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<EC2_PUBLIC_IP>')
echo "==> Done! API available at http://${EC2_IP}:3000"
echo "    Health check: curl http://${EC2_IP}:3000/health"
