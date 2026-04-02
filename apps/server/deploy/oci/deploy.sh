#!/usr/bin/env bash
# deploy.sh — Idempotent deploy script. Run as the `tattletale` system user on the OCI VM.
# Called automatically by GitHub Actions (.github/workflows/deploy-production.yml) on
# every push to `main`. Also safe to run manually for ad-hoc deploys.
#
# Prerequisites (set up by provision.sh):
#   - This repo is cloned to /opt/tattletale
#   - sudoers drop-in allows `tattletale` to restart tattletale-server without a password
#   - .env.production exists at /opt/tattletale/apps/server/.env.production
set -euo pipefail

APP_DIR="/opt/tattletale"
SERVICE="tattletale-server"
HEALTH_URL="http://127.0.0.1:3001/health"
READY_URL="http://127.0.0.1:3001/ready"
MAX_HEALTH_ATTEMPTS=12   # 12 × 5 s = 60 s timeout
HEALTH_INTERVAL=5

log() { echo "[deploy] $*"; }

# ── 1. Pull latest code ───────────────────────────────────────────────────────
log "Pulling latest code..."
cd "$APP_DIR"
git fetch --all --tags
git reset --hard origin/main

# ── 2. Dependencies ───────────────────────────────────────────────────────────
log "Installing dependencies..."
npm ci --prefer-offline

# ── 3. Source .env.production ─────────────────────────────────────────────────
# The systemd EnvironmentFile only applies to the managed process, not this SSH
# session. Prisma (generate + migrate deploy) and any build steps that read env
# vars need DATABASE_URL etc. available here.
ENV_FILE="$APP_DIR/apps/server/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: $ENV_FILE not found. Create it from .env.production.example first."
  exit 1
fi
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
log "Loaded $ENV_FILE into environment."

# ── 4. Prisma client ─────────────────────────────────────────────────────────
log "Generating Prisma client..."
npm run prisma:generate

# ── 5. Full build (shared → web → server) ────────────────────────────────────
log "Building all packages..."
npm run build:all

# ── 6. Database migrations ───────────────────────────────────────────────────
log "Running database migrations..."
cd "$APP_DIR/apps/server"
npx prisma migrate deploy

# ── 7. Restart service ───────────────────────────────────────────────────────
log "Restarting $SERVICE..."
cd "$APP_DIR"
sudo systemctl restart "$SERVICE"

# ── 8. Health check (liveness) ───────────────────────────────────────────────
log "Waiting for service to come up (up to $((MAX_HEALTH_ATTEMPTS * HEALTH_INTERVAL))s)..."
for attempt in $(seq 1 "$MAX_HEALTH_ATTEMPTS"); do
  sleep "$HEALTH_INTERVAL"
  if curl -fsS "$HEALTH_URL" > /dev/null 2>&1; then
    log "Health check passed on attempt $attempt."
    break
  fi
  if [ "$attempt" -eq "$MAX_HEALTH_ATTEMPTS" ]; then
    log "ERROR: Service did not come up after $((MAX_HEALTH_ATTEMPTS * HEALTH_INTERVAL))s."
    sudo systemctl status "$SERVICE" --no-pager --lines=30
    exit 1
  fi
  log "Attempt $attempt/$MAX_HEALTH_ATTEMPTS — not ready yet, retrying in ${HEALTH_INTERVAL}s..."
done

# ── 9. Ready check (Redis + Postgres reachable) ───────────────────────────────
if curl -fsS "$READY_URL" > /dev/null 2>&1; then
  log "Ready check passed — Redis and Postgres reachable."
else
  log "WARNING: Ready check failed. Service is up but a dependency may be slow."
  log "Investigate: sudo journalctl -u $SERVICE -n 50 --no-pager"
fi

log "Deploy complete."
