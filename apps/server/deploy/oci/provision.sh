#!/usr/bin/env bash
# provision.sh — Idempotent one-time VM setup for TattleTale on OCI Ubuntu.
# Run as root on a fresh VM: sudo bash provision.sh
#
# What this does (each step is idempotent):
#   1. Installs Node 20, Redis, Caddy from official repos
#   2. Creates the `tattletale` system user
#   3. Clones the repo to /opt/tattletale
#   4. Configures Redis with AOF + snapshot durability
#   5. Installs and enables the tattletale-server systemd unit
#   6. Installs the Caddyfile template (admin must edit domain before starting)
#   7. Writes a sudoers drop-in so deploy.sh can restart the service without a password
#   8. Creates the .ssh/authorized_keys slot for the GitHub Actions deploy key
#
# After running, follow the numbered checklist printed at the end.
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_USER="tattletale"
APP_DIR="/opt/tattletale"
REPO_URL="https://github.com/Ambitious-Jay/TattleTale.git"
NODE_MAJOR="20"

log()  { echo "[provision] $*"; }
ok()   { echo "[provision] ✓ $*"; }
skip() { echo "[provision] — $* (already done, skipping)"; }

# ── Must be root ──────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Run as root (sudo bash provision.sh)" >&2
  exit 1
fi

# ── 1. System packages ────────────────────────────────────────────────────────
log "Updating package index..."
apt-get update -qq

log "Installing git and redis-server..."
apt-get install -y -qq git redis-server

log "Checking Caddy..."
if ! command -v caddy &>/dev/null; then
  log "Installing Caddy from official repo..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
  ok "Caddy installed: $(caddy version)"
else
  skip "Caddy ($(caddy version))"
fi

log "Checking Node.js..."
if ! node -v 2>/dev/null | grep -q "^v${NODE_MAJOR}"; then
  log "Installing Node ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node $(node -v) installed."
else
  skip "Node $(node -v)"
fi

# ── 2. App user ───────────────────────────────────────────────────────────────
log "Checking app user '$APP_USER'..."
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --create-home --shell /bin/bash "$APP_USER"
  ok "User '$APP_USER' created."
else
  skip "User '$APP_USER'"
fi

# ── 3. Repo ───────────────────────────────────────────────────────────────────
log "Setting up $APP_DIR..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
  ok "Repo cloned to $APP_DIR."
else
  skip "Repo (already cloned)"
fi

DEPLOY_FILES="$APP_DIR/apps/server/deploy/oci"

# ── 4. Redis durability ───────────────────────────────────────────────────────
log "Configuring Redis durability..."
REDIS_CHANGED=false
cp "$DEPLOY_FILES/redis-durable.conf" /etc/redis/redis-durable.conf
if ! grep -qF "include /etc/redis/redis-durable.conf" /etc/redis/redis.conf; then
  echo 'include /etc/redis/redis-durable.conf' >> /etc/redis/redis.conf
  ok "Redis durability config appended to redis.conf."
  REDIS_CHANGED=true
else
  skip "Redis durability include (already present)"
fi
systemctl enable redis-server
# Only restart Redis if the config actually changed — an unconditional restart
# would drop active game sessions on re-runs of this script.
if [ "$REDIS_CHANGED" = "true" ]; then
  systemctl restart redis-server
  ok "Redis restarted with new durability config."
else
  ok "Redis config unchanged — not restarted."
fi

# ── 5. systemd service ────────────────────────────────────────────────────────
log "Installing systemd service..."
cp "$DEPLOY_FILES/tattletale-server.service" /etc/systemd/system/tattletale-server.service
systemctl daemon-reload
systemctl enable tattletale-server
ok "tattletale-server service installed and enabled (not started yet)."

# ── 6. Caddy config template ──────────────────────────────────────────────────
log "Installing Caddy config template..."
mkdir -p /var/log/caddy
# caddy user may not exist yet if Caddy was just installed; fall back to root ownership
chown caddy:caddy /var/log/caddy 2>/dev/null || true
# Only install the template if the file is missing or still matches the repo template.
# If the operator has already edited /etc/caddy/Caddyfile with real domain/email,
# re-running this script must NOT overwrite their edits — doing so would break
# Let's Encrypt certificate issuance.
if [ ! -f /etc/caddy/Caddyfile ] || diff -q "$DEPLOY_FILES/Caddyfile" /etc/caddy/Caddyfile > /dev/null 2>&1; then
  cp "$DEPLOY_FILES/Caddyfile" /etc/caddy/Caddyfile
  ok "Caddyfile template installed. You MUST edit /etc/caddy/Caddyfile before starting Caddy."
else
  skip "Caddyfile (already customised — not overwriting)"
fi
systemctl enable caddy

# ── 7. sudoers drop-in ────────────────────────────────────────────────────────
log "Writing sudoers rule for service restart..."
SUDOERS_FILE="/etc/sudoers.d/tattletale"
cat > "$SUDOERS_FILE" <<EOF
# Allows the tattletale system user to restart/inspect its own service without a
# password. Required by apps/server/deploy/oci/deploy.sh.
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart tattletale-server, /usr/bin/systemctl status tattletale-server
EOF
chmod 440 "$SUDOERS_FILE"
# visudo -c validates the file; a bad sudoers file can lock you out of sudo.
visudo -c -f "$SUDOERS_FILE"
ok "sudoers rule installed and validated at $SUDOERS_FILE."

# ── 8. SSH slot for GitHub Actions deploy key ─────────────────────────────────
log "Preparing SSH authorized_keys slot..."
SSH_DIR="/home/$APP_USER/.ssh"
mkdir -p "$SSH_DIR"
chown "$APP_USER:$APP_USER" "$SSH_DIR"
chmod 700 "$SSH_DIR"
touch "$SSH_DIR/authorized_keys"
chown "$APP_USER:$APP_USER" "$SSH_DIR/authorized_keys"
chmod 600 "$SSH_DIR/authorized_keys"
ok "SSH dir ready at $SSH_DIR."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " PROVISIONING COMPLETE — complete these steps before first deploy:"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo " 1. Create .env.production:"
echo "      cp $APP_DIR/apps/server/.env.production.example \\"
echo "         $APP_DIR/apps/server/.env.production"
echo "      nano $APP_DIR/apps/server/.env.production"
echo "    Fill in: DATABASE_URL, DIRECT_URL, WEB_ORIGIN"
echo "    Set:     REDIS_URL=redis://127.0.0.1:6379"
echo "    Uncomment and set: STATIC_WEB_DIR=/opt/tattletale/apps/web/dist"
echo ""
echo " 2. Edit Caddyfile (replace placeholders with real domain and email):"
echo "      nano /etc/caddy/Caddyfile"
echo "      sudo caddy validate --config /etc/caddy/Caddyfile"
echo "    DNS must point to this VM before starting Caddy or Let's Encrypt will fail."
echo ""
echo " 3. Add the GitHub Actions deploy public key:"
echo "      echo 'ssh-ed25519 AAAA...' >> $SSH_DIR/authorized_keys"
echo "    (Paste contents of ~/.ssh/tattletale_deploy.pub from your local machine)"
echo ""
echo " 4. Initial build + migrate + start:"
echo "    Source .env.production first so Prisma can read DATABASE_URL:"
echo "      set -a && source $APP_DIR/apps/server/.env.production && set +a"
echo "      cd $APP_DIR"
echo "      sudo -u $APP_USER npm ci"
echo "      sudo -u $APP_USER npm run prisma:generate"
echo "      sudo -u $APP_USER npm run build:all"
echo "      cd apps/server && sudo -u $APP_USER npx prisma migrate deploy"
echo "      cd $APP_DIR && sudo systemctl start tattletale-server"
echo "      sudo systemctl status tattletale-server --no-pager"
echo ""
echo " 5. Start Caddy:"
echo "      sudo systemctl start caddy"
echo "      sudo systemctl status caddy --no-pager"
echo ""
echo " 6. Smoke check:"
echo "      curl -fsS http://127.0.0.1:3001/health"
echo "      curl -fsS https://your-domain.com/health"
echo ""
echo "══════════════════════════════════════════════════════════════"
