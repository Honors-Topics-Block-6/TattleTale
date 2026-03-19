# OCI Single-VM Runbook (Node + Redis + Caddy)

This runbook deploys TattleTale as a single-origin service:
- TLS/public edge: Caddy
- App runtime: Node/Fastify (`@tattletale/server`)
- Runtime state/timers: Redis on VM
- Durable records: Neon Postgres

## 1) VM + Network

1. Create an OCI Always Free Ubuntu VM (minimum 1 OCPU / 1 GB RAM).
2. In OCI Security List / NSG, allow inbound:
- `22/tcp` from your admin IP
- `80/tcp` from `0.0.0.0/0`
- `443/tcp` from `0.0.0.0/0`
3. Point DNS `A` record for your domain (example: `game.example.com`) to the VM public IP.

## 2) Base Packages

```bash
sudo apt update
sudo apt install -y curl git redis-server caddy
```

Install Node 20.x:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3) App User + Checkout

```bash
sudo useradd --system --create-home --shell /bin/bash tattletale || true
sudo mkdir -p /opt/tattletale
sudo chown -R tattletale:tattletale /opt/tattletale
sudo -u tattletale git clone https://github.com/Ambitious-Jay/TattleTale.git /opt/tattletale
cd /opt/tattletale
```

## 4) Build + Prisma

```bash
sudo -u tattletale npm ci
sudo -u tattletale npm run prisma:generate
sudo -u tattletale npm run build
```

Create `/opt/tattletale/apps/server/.env.production` from [`apps/server/.env.production.example`](../../.env.production.example), then fill secrets.

Run migrations against Neon:

```bash
cd /opt/tattletale/apps/server
sudo -u tattletale npx prisma migrate deploy
```

## 5) Redis Durability

```bash
sudo cp /opt/tattletale/apps/server/deploy/oci/redis-durable.conf /etc/redis/redis-durable.conf
echo 'include /etc/redis/redis-durable.conf' | sudo tee -a /etc/redis/redis.conf
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

## 6) systemd Service

```bash
sudo cp /opt/tattletale/apps/server/deploy/oci/tattletale-server.service /etc/systemd/system/tattletale-server.service
sudo systemctl daemon-reload
sudo systemctl enable tattletale-server
sudo systemctl start tattletale-server
sudo systemctl status tattletale-server --no-pager
```

## 7) Caddy (TLS + Reverse Proxy)

```bash
sudo cp /opt/tattletale/apps/server/deploy/oci/Caddyfile /etc/caddy/Caddyfile
# Edit domain/email in /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
sudo systemctl status caddy --no-pager
```

## 8) Post-Deploy Smoke Checks

From your local machine (replace domain):

```bash
curl -fsS https://game.example.com/health
curl -fsS https://game.example.com/ready
```

From VM (app-level smoke):

```bash
cd /opt/tattletale/apps/server
SERVER_ORIGIN=https://game.example.com sudo -u tattletale node scripts/socket-smoke.mjs
```

Browser sanity checks:
1. Open `https://game.example.com/playtest`.
2. Connect two tabs.
3. Create/join same lobby.
4. Send chat in lobby and confirm both tabs receive it.

## 9) Rollout Procedure

```bash
cd /opt/tattletale
sudo -u tattletale git fetch --all --tags
sudo -u tattletale git checkout <release_sha_or_tag>
sudo -u tattletale npm ci
sudo -u tattletale npm run prisma:generate
sudo -u tattletale npm run build
cd /opt/tattletale/apps/server
sudo -u tattletale npx prisma migrate deploy
sudo systemctl restart tattletale-server
sudo systemctl status tattletale-server --no-pager
```

## 10) Rollback Procedure

```bash
cd /opt/tattletale
sudo -u tattletale git checkout <previous_release_sha_or_tag>
sudo -u tattletale npm ci
sudo -u tattletale npm run prisma:generate
sudo -u tattletale npm run build
cd /opt/tattletale/apps/server
sudo -u tattletale npx prisma migrate deploy
sudo systemctl restart tattletale-server
```

If rollback is due to latest DB migration incompatibility, restore DB from backup before restarting the older build.

## 11) Operations Notes

- `/health` is process liveness and should stay `200` if process is up.
- `/ready` checks Redis + Postgres and returns `503` when dependencies are not healthy.
- With Redis AOF enabled, runtime state can survive process restarts; clients can reconnect with lobby/player token state.
- Missed chat replay is not part of this baseline; chat is live stream plus audit persistence.
