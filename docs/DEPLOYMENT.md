# Backend Deployment Plan

**Goal:** `barobar-monitoring-server`를 EC2에서 Docker Compose app/postgres + host Caddy + Let's Encrypt 자동 HTTPS 구조로 배포한다.

**Scope:** 이 문서는 backend 서버 배포만 다룬다. Frontend 배포와 frontend 환경변수 설정은 `barobar-monitoring-dashboard` 프로젝트에서 처리한다.

## Target Architecture

```text
https://<backend-api-host>
  -> EC2 host Caddy
  -> 127.0.0.1:4000
  -> Docker Compose app container
  -> Docker Compose postgres container
```

```text
실서비스 FE/BE
  -> POST https://<backend-api-host>/api/replays

대시보드 FE
  -> https://<backend-api-host>/api/admin/*
```

## Current Repository Facts

- `package.json` has `build`, `start:prod`, `test`, and `test:e2e` scripts.
- Local verification passed with `pnpm exec jest --runInBand --watchman=false`: 9 suites, 32 tests.
- Local verification passed with `pnpm build`.
- `.env.example` contains only secret or secret-bearing example values.
- Local `storage/` is ignored by git and is only local runtime data.
- Replay gzip files are stored on disk under `${STORAGE_PATH}/replays/<tenant>/...`.
- Replay DB rows store the matching `storageKey`; replay detail lookup needs both the DB row and the gzip file.
- `src/main.ts` currently uses unrestricted `app.enableCors()` and `json({ limit: '50mb' })`.
- `POST /api/replays` validates tenant/public key/origin through service logic.
- `GET /api/admin/*` currently has no visible authentication guard in `src/admin/admin.controller.ts`.
- Existing `docker-compose.yml` only runs PostgreSQL and exposes `5432:5432`; it is local-dev only and should not be used as production compose.

## Initial EC2 Sizing Assumptions

- Instance type: `t4g.small`
- Instance shape: 2 vCPU, 2 GiB memory, Arm/Graviton2
- EBS storage: 30GB
- Average replay gzip size: 190KB per session
- Replay retention: capacity-based cleanup only; do not delete replay data by age alone

30GB should not be treated as fully available for replay files because the same disk also holds OS files, Docker images/layers, container logs, PostgreSQL data, and DB backups. Use the replay estimate below as a capacity guide, not as a fixed deletion schedule. Replay data should remain as long as disk capacity allows.

```text
100 sessions/day   -> about 570MB / 30 days
500 sessions/day   -> about 2.85GB / 30 days
1,000 sessions/day -> about 5.7GB / 30 days
2,000 sessions/day -> about 11.4GB / 30 days
3,000 sessions/day -> about 17.1GB / 30 days
5,000 sessions/day -> about 28.5GB / 30 days
```

Initial storage judgment:

```text
Up to 1,000 sessions/day: comfortable on 30GB
Around 2,000 sessions/day: workable, monitor disk usage
Around 3,000 sessions/day: possible but tight with OS/Docker/Postgres/backups
Around 5,000 sessions/day: not suitable for 30GB without aggressive cleanup or more storage
```

---

## Deployment Prerequisites

These tasks must be completed before exposing the backend publicly.

### 1. Admin API Authentication

- [ ] Protect every `/api/admin/*` endpoint.
- [ ] Add backend session login for dashboard access.
- [ ] Use secure cookie settings:

```text
HttpOnly=true
Secure=true
SameSite=Lax
```

- [ ] Keep admin auth on the backend. Do not rely on hidden URLs, frontend-only guards, or external hosting protection.

### 2. Production CORS Hardening

- [ ] Replace unrestricted `app.enableCors()` with explicit origin allowlist.
- [ ] Configure dashboard origin from environment:

```env
DASHBOARD_ORIGIN=<dashboard-production-origin>
```

- [ ] Allow 실서비스 FE origins for browser-based replay POSTs.
- [ ] Keep tenant/public key validation for both FE-origin and BE-origin ingestion requests.
- [ ] Use `credentials: true` only where session cookies are required.

### 3. Request Size And Error-Storm Protection

- [ ] Keep replay request body limit at `50mb`.
- [ ] Match Caddy request body limit to `50MB`.
- [ ] Add `/api/replays` rate limits using both tenant/public key and IP.
- [ ] Set 실서비스 monitoring POST timeout to `2s`.
- [ ] 실서비스 must ignore monitoring POST failure or timeout.

Confirmed decisions:

```text
Maximum replay request size: 50MB
Client timeout policy: 2 seconds
Drop policy: always ignore monitoring POST failure or timeout in 실서비스
Initial rate limit values:
- tenant/public key: 60 requests/min
- IP: 120 requests/min
Rate limit basis: both tenant/public key and IP
```

### 4. Production Secrets And Runtime Config

- [ ] Prepare production secret `.env` on EC2 only.
- [ ] Required secret or secret-bearing values:

```env
POSTGRES_PASSWORD=<strong-postgres-password>
DATABASE_URL=postgresql://barobar:<strong-password>@postgres:5432/barobar_monitoring
ADMIN_PASSWORD=<strong-admin-password>
ADMIN_SESSION_SECRET=<long-random-session-secret>
```

- [ ] Required non-secret runtime values:

```env
DASHBOARD_ORIGIN=<dashboard-production-origin>
REPLAY_ALLOWED_ORIGINS=<comma-separated-real-service-fe-origins>
```

- [ ] Set non-secret runtime values through EC2 shell env, Compose environment, or production `.env` if you decide to keep all runtime config together.
- [ ] Generate a long random `ADMIN_SESSION_SECRET` for production.
- [ ] Set a strong `ADMIN_PASSWORD`; do not reuse the database password.
- [ ] Ensure `DATABASE_URL` uses the same password as `POSTGRES_PASSWORD`.
- [ ] Do not commit production `.env`.
- [ ] In production, mount `/data/storage` to a persistent Docker volume.

Optional defaults:

```text
NODE_ENV is set to production by docker-compose.prod.yml.
PORT is set to 4000 by docker-compose.prod.yml.
STORAGE_PATH is set to /data/storage by docker-compose.prod.yml.
POSTGRES_USER defaults to barobar.
POSTGRES_DB defaults to barobar_monitoring.
ADMIN_USERNAME defaults to admin.
ADMIN_SESSION_TTL_SECONDS defaults to 28800.
ADMIN_SESSION_COOKIE_NAME defaults to barobar_admin_session.
REPLAY_TENANT_RATE_LIMIT_PER_MINUTE defaults to 60.
REPLAY_IP_RATE_LIMIT_PER_MINUTE defaults to 120.
REPLAY_STORAGE_WARNING_USAGE_PERCENT defaults to 75.
REPLAY_CLEANUP_START_USAGE_PERCENT defaults to 80.
REPLAY_CLEANUP_STOP_USAGE_PERCENT defaults to 70.
REPLAY_STORAGE_EMERGENCY_USAGE_PERCENT defaults to 90.
```

### 5. Replay Storage Cleanup

- [ ] Implement automatic cleanup with a capacity-based retention policy.
- [ ] Delete both replay gzip files and matching DB records.
- [ ] Do not delete gzip files without deleting DB metadata, because dashboard replay detail can break.
- [ ] Add cleanup logs with deleted DB row count and deleted file count.
- [ ] Add a dry-run mode or test path before enabling destructive cleanup.
- [ ] Run cleanup once per day after deployment.

Cleanup scope:

```text
Replay retention policy:
- Do not delete replay data by age alone.
- Keep replay data indefinitely while disk usage is healthy.
- If disk pressure is high, delete oldest replay data first until usage returns below the cleanup stop threshold.
- Delete recent replay data only if all older replay data has already been deleted and disk pressure still threatens service availability.

Initial disk thresholds:
- warning: 75% disk usage
- cleanup start: 80% disk usage
- cleanup stop: 70% disk usage
- emergency alert: 90% disk usage

Delete targets:
- old Replay records
- linked old ErrorEvent records when safe
- old replay gzip files under STORAGE_PATH
Keep:
- Error aggregate records needed for dashboard grouping, unless explicitly designed otherwise
```

Recommended implementation:

```text
Add a backend cleanup command or service.
Run it daily from EC2 cron or as a scheduled container command.
Prefer explicit cleanup command first; avoid hidden destructive cleanup on normal API request path.
Sort delete candidates by replay creation time ascending, oldest first.
Production command: `pnpm cleanup:replays`.
Dry-run command before enabling deletion: `pnpm cleanup:replays -- --dry-run`.
```

### 6. Docker Production Files

- [ ] Add `.dockerignore`:

```text
node_modules
dist
.git
.env
.env.*
storage
coverage
```

- [ ] Add production `Dockerfile`.
- [ ] Docker image must build the NestJS app and run:

```bash
node dist/main
```

- [ ] Keep Prisma migration execution available through the app image or a migration command image.
- [ ] Add `docker-compose.prod.yml` with `app` and `postgres`.
- [ ] Bind app only to localhost on the EC2 host:

```yaml
ports:
  - "127.0.0.1:4000:4000"
```

- [ ] Do not expose postgres publicly.
- [ ] Persist DB and replay files with Docker volumes:

```yaml
volumes:
  postgres_data:
  replay_storage:
```

Production replay storage mapping:

```text
Host/Docker volume: replay_storage
App container path: /data/storage
Replay file path: /data/storage/replays/<tenant>/<replay-id>.json.gz
DB value: replays/<tenant>/<replay-id>.json.gz
```

Operational note:

```text
The local repo path `storage/replays` is not a deployment artifact.
Production replay files live in the `replay_storage` Docker volume.
Container rebuilds must not delete this volume.
Deleting the Docker volume or losing the EC2/EBS volume can lose replay gzip files.
Do not use `docker compose down -v` in production.
Do not remove `postgres_data` or `replay_storage` unless intentionally destroying production data.
```

### 7. CI Before CD

- [ ] Add GitHub Actions CI.
- [ ] Required CI commands:

```bash
pnpm install --frozen-lockfile
pnpm exec jest --runInBand --watchman=false
pnpm build
docker build -t barobar-monitoring-server:ci .
```

- [ ] Deployment must not run if CI fails.

### 8. Backend API Host Readiness

- [ ] Confirm the final backend API host value.
- [ ] Confirm `https://<backend-api-host>` is the API base URL that frontend and real services will call.
- [ ] Confirm Caddy can use `<backend-api-host>` for automatic HTTPS issuance.

Meaning:

```text
backend-api-host = the public HTTPS host clients use to reach this monitoring backend

Example:
monitoring-api.example.com

Full API base URL:
https://monitoring-api.example.com
```

Decision inputs needed:

```text
1. Final backend API host value
2. Final dashboard production origin
3. 실서비스 FE origins that will call POST /api/replays from browsers
```

---

## Deployment Stages

### Stage 1. EC2 Host Setup

- [ ] Security group:
  - allow `80/tcp` from internet
  - allow `443/tcp` from internet
  - allow `22/tcp` only from trusted IPs when possible
  - block public `4000/tcp`
  - block public `5432/tcp`
- [ ] Install Docker and Docker Compose plugin.
- [ ] Install Caddy on the host.
- [ ] Create app and backup directories:

```bash
sudo mkdir -p /srv/barobar-monitoring-server
sudo mkdir -p /var/backups/barobar-monitoring
```

### Stage 2. Caddy HTTPS Reverse Proxy

- [ ] Create `/etc/caddy/Caddyfile`:

```caddyfile
<backend-api-host> {
  encode zstd gzip

  request_body {
    max_size 50MB
  }

  reverse_proxy 127.0.0.1:4000
}
```

- [ ] Validate and reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- [ ] Confirm Caddy can issue Let's Encrypt certificate:
  - `<backend-api-host>` reaches EC2
  - port `80` reaches EC2
  - port `443` reaches EC2

### Stage 3. First Manual Backend Deploy

- [ ] Clone repository:

```bash
cd /srv
sudo git clone git@github.com:Chahoo-Front-Project-Collection/barobar-monitoring-server.git
sudo chown -R $USER:$USER /srv/barobar-monitoring-server
cd /srv/barobar-monitoring-server
```

- [ ] Create `/srv/barobar-monitoring-server/.env`.
- [ ] Build and start:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm app pnpm prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d app
```

- [ ] Do not use volume-removing commands during deploy:

```bash
# Forbidden in production unless intentionally destroying data:
docker compose -f docker-compose.prod.yml down -v
docker volume rm <project>_postgres_data
docker volume rm <project>_replay_storage
```

- [ ] Smoke test:

```bash
curl -i http://127.0.0.1:4000/health
curl -i https://<backend-api-host>/health
```

- [ ] Verify:
  - `/health` returns `{"status":"ok"}` without checking PostgreSQL or replay storage
  - admin endpoints reject unauthenticated requests
  - valid replay POST creates DB metadata
  - valid replay POST creates gzip replay file

### Stage 4. GitHub Actions CD

- [ ] Add production environment in GitHub.
- [ ] Add secrets:

```text
EC2_HOST
EC2_USER
EC2_SSH_KEY
EC2_PORT
EC2_KNOWN_HOSTS
APP_DIR=/srv/barobar-monitoring-server
BACKEND_API_BASE_URL=https://<backend-api-host>
```

`EC2_KNOWN_HOSTS` is recommended. If it is not set, the deploy workflow uses `ssh-keyscan` at deploy time.

- [ ] Add deploy workflow:
  - current initial mode: `workflow_dispatch` manual deploy only
  - run test/build/docker-build preflight first
  - SSH into EC2 only after CI passes
  - use a concurrency group to prevent overlapping deploys
  - run a post-deploy smoke test for public HTTPS health

Automatic deploy trigger can be added later after EC2, Caddy, production `.env`, and GitHub secrets are ready.

- [ ] EC2 deploy commands:

```bash
cd "$APP_DIR"
git fetch origin main
git checkout "$GITHUB_SHA"
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm app pnpm prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d app
docker image prune -f
```

Forbidden in CD:

```bash
docker compose -f docker-compose.prod.yml down -v
docker volume rm <project>_postgres_data
docker volume rm <project>_replay_storage
```

### Stage 5. Backup And Retention

- [ ] Add daily PostgreSQL backup using `pg_dump`.
- [ ] Run `pg_dump` daily at 05:00 KST.
- [ ] Store backups under `/var/backups/barobar-monitoring`.
- [ ] Keep PostgreSQL backups for 5 days.
- [ ] Delete PostgreSQL backups older than 5 days.
- [ ] Test one restore before production use.
- [ ] Verify backup readability with `pnpm backup:postgres:verify -- <backup-file>`.
- [ ] Run daily replay cleanup with the capacity-based retention policy.
- [ ] Estimate replay storage using `190KB` per session as the initial sizing baseline.
- [ ] Monitor disk usage for postgres and replay storage.

Confirmed decision:

```text
Replay retention policy:
- Do not delete replay data by age alone.
- Keep replay data indefinitely while disk usage is healthy.
- Delete oldest replay data only when disk usage crosses the configured threshold.
- Initial thresholds: warn at 75%, start cleanup at 80%, stop cleanup at 70%, alert at 90%.
Average replay gzip size: 190KB per session

PostgreSQL backup retention:
- Keep daily backups for 5 days.
- Delete backups older than 5 days.

PostgreSQL backup timing:
- Run daily at 05:00 KST.
- If the EC2 host uses UTC cron, schedule it at 20:00 UTC on the previous day or set the cron timezone to Asia/Seoul.
```

Backup commands:

```bash
APP_DIR=/srv/barobar-monitoring-server BACKUP_DIR=/var/backups/barobar-monitoring pnpm backup:postgres
pnpm backup:postgres:verify -- /var/backups/barobar-monitoring/barobar_monitoring_latest.dump
```

Host cron example:

```cron
CRON_TZ=Asia/Seoul
0 5 * * * cd /srv/barobar-monitoring-server && BACKUP_DIR=/var/backups/barobar-monitoring pnpm backup:postgres >> /var/log/barobar-monitoring-backup.log 2>&1
```

Disk monitoring command:

```bash
pnpm monitor:disk
```

Replay storage estimate:

```text
Formula:
daily sessions * 190KB * 30 days

100 sessions/day   -> about 570MB / 30 days
500 sessions/day   -> about 2.85GB / 30 days
1,000 sessions/day -> about 5.7GB / 30 days
5,000 sessions/day -> about 28.5GB / 30 days
```

Backup purpose:

```text
PostgreSQL backup is for recovery when DB data is accidentally deleted,
corrupted by a bug, or damaged during migration.
It is separate from replay gzip retention.
The current same-EC2 backup plan does not fully protect against EC2/EBS volume loss.
Protecting against EC2/EBS volume loss requires off-instance backup or EBS snapshots.
```

### Stage 6. Post-Deployment Operations

These are not blockers for the first successful deploy, but they need an owner after production traffic starts.

- [ ] Review disk usage after the first day of real replay traffic.
- [ ] Review disk usage after the first week of real replay traffic.
- [ ] Confirm cleanup job does not delete by age alone.
- [ ] Confirm cleanup job deletes oldest records/files only after disk usage crosses the cleanup threshold.
- [ ] Confirm DB backup files are being created.
- [ ] Confirm at least one DB backup can be restored.
- [ ] Revisit replay retention if daily sessions exceed 2,000 on the 30GB disk.
- [ ] Revisit instance size if CPU credits, memory, or Docker/Postgres pressure becomes visible.

User decisions after deployment:

```text
1. If disk usage grows faster than expected, lower cleanup thresholds, increase EBS size, or move replay storage off-instance?
2. If backup files take meaningful disk space even with 5-day retention, reduce backup frequency, compress more aggressively, or move backups off-instance?
3. If ingestion is rate-limited during a real incident, raise the per-tenant/IP limits or keep protecting DB/disk?
4. If t4g.small CPU/memory is tight, upgrade to t4g.medium or reduce ingestion/storage work?
```

### Stage 7. Production Verification

- [ ] `https://<backend-api-host>/health` returns `{"status":"ok"}`.
- [ ] `https://<backend-api-host>` works.
- [ ] `http://<backend-api-host>` redirects to HTTPS.
- [ ] Public `4000` is blocked.
- [ ] Public `5432` is blocked.
- [ ] `/api/admin/*` returns unauthorized without session.
- [ ] `/api/admin/*` returns data with valid session.
- [ ] Valid tenant/public key/origin can POST replay.
- [ ] Invalid tenant/public key/origin is rejected.
- [ ] Replay gzip file persists after app container rebuild.
- [ ] Cleanup job keeps replay data while disk is healthy and deletes oldest replay files/DB records under disk pressure.
- [ ] Docker containers restart after EC2 reboot.
- [ ] Caddy restarts after EC2 reboot.
- [ ] Caddy certificate is active and auto-managed.

## Execution Order Summary

1. Answer remaining decision inputs for origins.
2. Finish admin auth, CORS hardening, request limit/rate protection, production env design, and replay cleanup implementation.
3. Add Dockerfile, `.dockerignore`, and `docker-compose.prod.yml`.
4. Add CI with tests, build, and Docker image build check.
5. Prepare EC2 security group, Docker, Caddy, and directories.
6. Configure Caddy for `<backend-api-host>`.
7. Run first manual backend deploy.
8. Confirm HTTPS and backend smoke tests.
9. Add GitHub Actions CD.
10. Add DB backup, daily replay cleanup, and disk monitoring.
11. Run production verification end to end.
12. Review post-deployment operations after real traffic starts.

## Acceptance Criteria

- Backend is served at `https://<backend-api-host>`.
- Caddy handles HTTPS automatically through Let's Encrypt.
- Docker Compose runs `app` and `postgres`.
- App port `4000` is bound only to `127.0.0.1` on EC2.
- PostgreSQL port `5432` is not public.
- Admin APIs require authenticated session.
- Replay ingestion works only for valid tenant/public key/origin.
- Replay cleanup does not delete by age alone and removes oldest gzip files plus matching DB records only when disk pressure requires it.
- Rebuilding the app container does not delete PostgreSQL data or replay gzip files.
- Production deploy scripts do not use `docker compose down -v` or remove `postgres_data` / `replay_storage`.
- CI must pass before CD.
- Production migrations use `pnpm prisma migrate deploy`.
