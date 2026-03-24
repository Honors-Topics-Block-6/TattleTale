# Production Hosting Automation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate TattleTale's full production lifecycle — one-time VM provisioning and continuous deployment on every push to `main` — using only free-forever services.

**Architecture:** An OCI Always Free Ubuntu VM (Ampere A1: 4 OCPU / 24 GB RAM) runs Node/Fastify + Redis behind a Caddy TLS reverse proxy. GitHub Actions SSHes into the VM on every push to `main` and runs `deploy.sh`. Neon free-tier PostgreSQL handles durable records. All services have no expiry and $0 cost.

**Tech Stack:** Bash, GitHub Actions (`appleboy/ssh-action@v1.2.0`), systemd, Caddy (auto-HTTPS via Let's Encrypt), Redis AOF, Neon Postgres, Node 20 LTS.

---

## Free Services Used

| Service | Purpose | Free Limit | Expiry |
|---|---|---|---|
| OCI Always Free (Ampere A1) | VM compute + Redis | 4 OCPU / 24 GB RAM | Never |
| Neon Postgres | Durable records | 0.5 GB, 1 project | Never |
| Caddy + Let's Encrypt | TLS termination + reverse proxy | Unlimited | Never |
| GitHub Actions | CI/CD | 2000 min/month (public repo) | Never |

---

## File Structure

### Files to Create

- `apps/server/deploy/oci/provision.sh`
  - Idempotent first-time VM setup. Installs Node 20, Redis, Caddy; creates the `tattletale` system user; clones the repo; configures Redis AOF durability; installs the systemd service; installs the Caddyfile template; writes a sudoers drop-in so `deploy.sh` can restart the service; prepares the SSH authorized_keys slot for the GitHub Actions deploy key.
  - Run once as root on a fresh VM.

- `apps/server/deploy/oci/deploy.sh`
  - Idempotent deploy script run on the VM via SSH by GitHub Actions. Pulls latest `main`, installs dependencies, builds all packages (shared → web → server), runs Prisma migrations, restarts the systemd service, waits for `/health` to respond, and checks `/ready`.
  - Also usable for manual deploys.

- `.github/workflows/deploy-production.yml`
  - CD workflow. Triggers on push to `main`. SSHes into the OCI VM as the `tattletale` user, runs `deploy.sh`, then hits the public HTTPS endpoints for a final smoke check from outside the VM.

### Files to Modify

- `package.json` (root, line 12)
  - Add `build:all` script: `build:shared && build:web && build:server`. The existing `build` script omits the web app, but `ENABLE_STATIC_WEB=true` in `.env.production.example` means Fastify serves `apps/web/dist` — so a production build that skips the web app leaves clients with no UI.

- `apps/server/deploy/oci/RUNBOOK.md`
  - Rewrite to reference `provision.sh` and `deploy.sh` instead of manual shell commands. Add GitHub Secrets setup, SSH key generation, and OCI shape recommendation (Ampere A1). Retain the manual rollback procedure and operations reference.

### Files Left Unchanged (Already Correct)

- `apps/server/deploy/oci/Caddyfile` — correct template
- `apps/server/deploy/oci/redis-durable.conf` — correct AOF configuration
- `apps/server/deploy/oci/tattletale-server.service` — correct systemd unit
- `apps/server/.env.production.example` — correct variable set

---

## Task 1: Add `build:all` to root `package.json`

**Files:**
- Modify: `package.json:12`

- [ ] **Step 1: Confirm `build` omits the web app**

```bash
npm run build && ls apps/web/dist/index.html
```

Expected: `ls` fails because `apps/web/dist` doesn't exist after `build` — this is the gap we're fixing.

- [ ] **Step 2: Add the script**

In `package.json`, add one line after the existing `"build"` entry. The relevant section currently reads (lines 12–14):

```json
    "build": "npm run build:shared && npm run build -w @tattletale/server",
    "build:shared": "npm run build -w @tattletale/shared",
    "build:server": "npm run build -w @tattletale/server",
    "build:web": "npm run build -w @tattletale/web",
```

Change to (add `"build:all"` on the new line 13):

```json
    "build": "npm run build:shared && npm run build -w @tattletale/server",
    "build:all": "npm run build:shared && npm run build:web && npm run build:server",
    "build:shared": "npm run build -w @tattletale/shared",
    "build:server": "npm run build -w @tattletale/server",
    "build:web": "npm run build -w @tattletale/web",
```

Note: `build:server` and `build:web` already exist as named scripts — `build:all` merely composes them in the correct dependency order.

- [ ] **Step 3: Verify it runs end-to-end**

```bash
npm run build:all
ls apps/web/dist/index.html
ls apps/server/dist/index.js
```

Expected: Both files exist. No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: add build:all script for full production build"
```

---

## Task 2: Create `apps/server/deploy/oci/deploy.sh`

**Files:**
- Create: `apps/server/deploy/oci/deploy.sh`

- [ ] **Step 1: Confirm the file does not exist**

```bash
ls apps/server/deploy/oci/
```

Expected: `Caddyfile  RUNBOOK.md  redis-durable.conf  tattletale-server.service` — no `deploy.sh`.

- [ ] **Step 2: Write the script**

Create `apps/server/deploy/oci/deploy.sh` with these exact contents:

```bash
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
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n apps/server/deploy/oci/deploy.sh
```

Expected: no output (syntax is clean).

- [ ] **Step 4: Make executable**

```bash
chmod +x apps/server/deploy/oci/deploy.sh
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/deploy/oci/deploy.sh
git commit -m "deploy: add idempotent VM deploy script"
```

---

## Task 3: Create `apps/server/deploy/oci/provision.sh`

**Files:**
- Create: `apps/server/deploy/oci/provision.sh`

This replaces the 11 sections of manual shell commands in the existing `RUNBOOK.md`. Run it once as root on a fresh OCI VM. It is idempotent — re-running it is safe.

- [ ] **Step 1: Write the script**

Create `apps/server/deploy/oci/provision.sh` with these exact contents:

```bash
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
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n apps/server/deploy/oci/provision.sh
```

Expected: no output (clean).

- [ ] **Step 3: Make executable**

```bash
chmod +x apps/server/deploy/oci/provision.sh
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/deploy/oci/provision.sh
git commit -m "deploy: add idempotent OCI provisioning script"
```

---

## Task 4: Create `.github/workflows/deploy-production.yml`

**Files:**
- Create: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Confirm no CD workflow exists**

```bash
ls .github/workflows/
```

Expected: `pr-backend-integrity.yml  pr-frontend-integrity.yml  pr-shared-integrity.yml` — no `deploy-*` file.

- [ ] **Step 2: Document required GitHub Secrets**

Before writing the workflow, add these secrets in GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value | How to get it |
|---|---|---|
| `OCI_HOST` | VM public IP address (e.g., `152.70.x.x`) | OCI Console → Instance details → Public IP |
| `OCI_SSH_KEY` | Full contents of the ed25519 private key | `cat ~/.ssh/tattletale_deploy` |
| `OCI_DOMAIN` | Production domain without `https://` (e.g., `game.yourdomain.com`) | Your DNS provider |

Generate the key pair (if not done yet):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/tattletale_deploy -N ""
# Private key → OCI_SSH_KEY secret in GitHub
# Public key  → append to /home/tattletale/.ssh/authorized_keys on the VM (provision.sh step 3)
cat ~/.ssh/tattletale_deploy      # copy this → OCI_SSH_KEY
cat ~/.ssh/tattletale_deploy.pub  # copy this → VM authorized_keys
```

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

# Triggers on every push to main (i.e., every merged PR).
# Pull requests are NOT deployed — only merged code hits production.
on:
  push:
    branches: [main]

permissions:
  contents: read

# Never cancel a running deploy. If two pushes land close together, the second
# one queues and runs after the first finishes rather than racing.
concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  CI: true

jobs:
  deploy:
    name: Deploy to OCI VM
    runs-on: ubuntu-latest
    # "production" environment adds an optional manual approval gate.
    # Create it in GitHub: Settings → Environments → New environment → production
    environment: production

    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.OCI_HOST }}
          username: tattletale
          key: ${{ secrets.OCI_SSH_KEY }}
          port: 22
          # script_stop: true makes the step fail if deploy.sh exits non-zero,
          # which surfaces the error in the Actions UI instead of silently passing.
          script_stop: true
          script: /opt/tattletale/apps/server/deploy/oci/deploy.sh

      # Hit the public HTTPS endpoint from the Actions runner (outside the VM)
      # to confirm Caddy is proxying correctly and the TLS cert is valid.
      # This catches networking/firewall/cert issues that the internal health
      # check inside deploy.sh cannot detect.
      - name: Public smoke test
        run: |
          echo "Checking public /health endpoint..."
          curl -fsS --retry 3 --retry-delay 5 "https://${{ secrets.OCI_DOMAIN }}/health"
          echo ""
          echo "Checking public /ready endpoint..."
          curl -fsS --retry 3 --retry-delay 5 "https://${{ secrets.OCI_DOMAIN }}/ready"
          echo ""
          echo "All smoke tests passed."
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "ci: add automated production deploy workflow"
```

---

## Task 5: Rewrite `apps/server/deploy/oci/RUNBOOK.md`

**Files:**
- Modify: `apps/server/deploy/oci/RUNBOOK.md`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `apps/server/deploy/oci/RUNBOOK.md` with:

```markdown
# OCI Single-VM Runbook (Node + Redis + Caddy)

TattleTale runs as a single-origin service on an OCI Always Free VM:

| Layer | Tool | Cost |
|---|---|---|
| TLS / reverse proxy | Caddy (auto-HTTPS via Let's Encrypt) | Free |
| App runtime | Node 20 / Fastify (`@tattletale/server`) | Free (on VM) |
| Runtime state / timers | Redis (on VM, AOF-durable) | Free (on VM) |
| Durable records | Neon Postgres (free tier) | Free |
| CI/CD | GitHub Actions | Free |

**Recommended VM shape:** OCI Ampere A1 Flex — 4 OCPU / 24 GB RAM (Always Free quota).
The AMD micro (1 OCPU / 1 GB) also qualifies as Always Free but will struggle under load.

---

## First-Time Setup

### 1. Create the VM

1. Log in to [cloud.oracle.com](https://cloud.oracle.com) → Compute → Instances → Create Instance.
2. Choose **Ampere A1 Flex** shape — set 4 OCPU and 24 GB RAM (both within the Always Free quota).
3. OS image: **Ubuntu 22.04 LTS (aarch64)**.
4. Add your personal SSH public key during VM creation (for admin access).
5. In the instance's **Security List / NSG**, open inbound:
   - `22/tcp` — from your admin IP only
   - `80/tcp` — from `0.0.0.0/0`
   - `443/tcp` — from `0.0.0.0/0`
6. Point a DNS `A` record for your domain (e.g., `game.yourdomain.com`) to the VM's public IP. Wait for DNS propagation before starting Caddy — Let's Encrypt will fail if the domain doesn't resolve yet.

### 2. Generate the GitHub Actions Deploy Key

On your local machine (not the VM):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/tattletale_deploy -N ""
```

- `~/.ssh/tattletale_deploy` → **private key** — add to GitHub Secrets as `OCI_SSH_KEY`
- `~/.ssh/tattletale_deploy.pub` → **public key** — installed on the VM in step 4

### 3. Add GitHub Secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `OCI_HOST` | VM public IP (e.g., `152.70.x.x`) |
| `OCI_SSH_KEY` | Full contents of `~/.ssh/tattletale_deploy` (the private key) |
| `OCI_DOMAIN` | Domain without `https://` (e.g., `game.yourdomain.com`) |

### 4. Run the Provisioning Script

SSH into the VM with your personal admin key:

```bash
ssh ubuntu@<VM_IP>
```

Then run (as root):

```bash
curl -fsSL https://raw.githubusercontent.com/Ambitious-Jay/TattleTale/main/apps/server/deploy/oci/provision.sh \
  | sudo bash
```

Or copy from your local checkout:

```bash
scp apps/server/deploy/oci/provision.sh ubuntu@<VM_IP>:/tmp/provision.sh
ssh ubuntu@<VM_IP> "sudo bash /tmp/provision.sh"
```

`provision.sh` is **idempotent** — re-running it is safe.

### 5. Complete the Post-Provision Checklist (Printed by the Script)

**a) Create `.env.production`:**

```bash
cp /opt/tattletale/apps/server/.env.production.example \
   /opt/tattletale/apps/server/.env.production
nano /opt/tattletale/apps/server/.env.production
```

Values to fill in:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooler connection string |
| `DIRECT_URL` | Neon direct connection string (used by Prisma migrations) |
| `REDIS_URL` | `redis://127.0.0.1:6379` (Redis is local to the VM) |
| `WEB_ORIGIN` | `https://game.yourdomain.com` |
| `STATIC_WEB_DIR` | `/opt/tattletale/apps/web/dist` ← uncomment and set this |

> **Note on `HOST`:** The example ships with `HOST=127.0.0.1`, not `0.0.0.0`. This is intentional for this topology — Caddy handles all public-facing binds and proxies to Node on localhost. Leave `HOST=127.0.0.1`. Setting it to `0.0.0.0` would expose the Node process directly on the public interface, bypassing Caddy and its security headers.

**b) Edit Caddyfile:**

```bash
sudo nano /etc/caddy/Caddyfile
# Replace: game.example.com  → your domain
# Replace: ops@example.com   → your email (for Let's Encrypt notifications)
sudo caddy validate --config /etc/caddy/Caddyfile
```

**c) Add the GitHub Actions deploy public key to the VM:**

```bash
# On your local machine, copy the public key:
cat ~/.ssh/tattletale_deploy.pub
# On the VM:
echo 'ssh-ed25519 AAAA...' >> /home/tattletale/.ssh/authorized_keys
```

**d) Initial build + migrate + start:**

```bash
cd /opt/tattletale
sudo -u tattletale npm ci
sudo -u tattletale npm run prisma:generate
sudo -u tattletale npm run build:all
cd apps/server
sudo -u tattletale npx prisma migrate deploy
cd /opt/tattletale
sudo systemctl start tattletale-server
sudo systemctl status tattletale-server --no-pager
sudo systemctl start caddy
sudo systemctl status caddy --no-pager
```

**e) Smoke check:**

```bash
# HTTP/REST health
curl -fsS http://127.0.0.1:3001/health   # process liveness
curl -fsS https://game.yourdomain.com/health

# Socket.IO connectivity (verifies WebSocket transport — the primary game mechanic)
# Note: use `sudo -u ... env VAR=val cmd` not `VAR=val sudo ...` — Ubuntu's sudo
# strips caller-environment variables by default (env_reset in sudoers).
cd /opt/tattletale/apps/server
sudo -u tattletale env SERVER_ORIGIN=https://game.yourdomain.com node scripts/socket-smoke.mjs
```

**f) Browser two-tab test (confirms full game flow):**

1. Open `https://game.yourdomain.com/playtest` in two separate browser tabs.
2. Connect both tabs.
3. Create/join the same lobby from each tab.
4. Send a chat message — confirm both tabs receive it in real time.

---

## Ongoing Deployments (Automated)

Every push (or merged PR) to `main` triggers `.github/workflows/deploy-production.yml`, which:

1. SSHes into the VM as the `tattletale` user
2. Runs `/opt/tattletale/apps/server/deploy/oci/deploy.sh`
3. Hits the public `/health` and `/ready` endpoints from the Actions runner for a final confirmation

No manual action is needed for normal releases.

---

## Manual Deploy

```bash
ssh tattletale@<VM_IP> /opt/tattletale/apps/server/deploy/oci/deploy.sh
```

---

## Rollback

```bash
ssh ubuntu@<VM_IP>
cd /opt/tattletale
sudo -u tattletale git checkout <previous_sha_or_tag>
sudo -u tattletale npm ci
sudo -u tattletale npm run prisma:generate
sudo -u tattletale npm run build:all
cd apps/server
sudo -u tattletale npx prisma migrate deploy
cd /opt/tattletale
sudo systemctl restart tattletale-server
sudo systemctl status tattletale-server --no-pager
```

> If rolling back due to a bad DB migration, restore Neon from a backup snapshot **before** restarting the old build.

---

## Operations Reference

### Health Endpoints

| Endpoint | Meaning |
|---|---|
| `GET /health` | Process liveness. `200` = process is up. |
| `GET /ready` | Dependency health. `200` = Redis + Postgres reachable. `503` = degraded. |

### Useful Commands

```bash
# Live log stream
sudo journalctl -u tattletale-server -f

# Last 50 lines
sudo journalctl -u tattletale-server -n 50 --no-pager

# Service status
sudo systemctl status tattletale-server --no-pager

# Redis ping
redis-cli ping

# Caddy access log
sudo tail -f /var/log/caddy/tattletale-access.log
```

### Notes

- **Redis AOF + snapshots** mean runtime state (lobbies, player tokens) survives process restarts. Clients can reconnect without losing lobby membership.
- **Caddy** renews TLS certificates automatically — no manual cert rotation needed.
- **OCI Always Free** provides no SLA. This is appropriate for v1/testing. If uptime guarantees become a requirement, move to paid compute or add a second Always Free VM with Caddy load balancing.
- **Missed chat replay** is not implemented in v1; chat is a live stream with audit persistence in Postgres.
- **Scaling path** (when needed): the Neon and Redis layers are already externalisable — Neon is already managed, and Redis can migrate to Upstash (free tier) or a second VM. The deploy pipeline works identically with multiple VMs behind Caddy.
```

- [ ] **Step 2: Verify the markdown renders cleanly** (no broken table rows, code fences close)

Open the file in any Markdown previewer or run:

```bash
# Quick structural check — every ``` should appear an even number of times
grep -c '```' apps/server/deploy/oci/RUNBOOK.md
```

Expected: an even number (each code block has an open and close fence).

- [ ] **Step 3: Commit**

```bash
git add apps/server/deploy/oci/RUNBOOK.md
git commit -m "docs: rewrite RUNBOOK to reference automated deploy pipeline"
```

---

## Verification Checklist (After All Tasks)

- [ ] `npm run build:all` succeeds and produces `apps/web/dist/index.html` + `apps/server/dist/index.js`
- [ ] `bash -n apps/server/deploy/oci/deploy.sh` exits clean
- [ ] `bash -n apps/server/deploy/oci/provision.sh` exits clean
- [ ] `.github/workflows/deploy-production.yml` is valid YAML (`python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)" < .github/workflows/deploy-production.yml`)
- [ ] All four files committed on the `webHosting` branch
- [ ] Three GitHub Secrets added: `OCI_HOST`, `OCI_SSH_KEY`, `OCI_DOMAIN`
- [ ] On the VM: `provision.sh` completes without errors
- [ ] Post-provision checklist completed (`.env.production`, Caddyfile, deploy key, initial build)
- [ ] `curl http://127.0.0.1:3001/health` returns 200 on the VM
- [ ] `curl https://your-domain.com/health` returns 200 from a browser or local machine
- [ ] Push a trivial change to `main` → GitHub Actions `deploy-production` job passes
