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
