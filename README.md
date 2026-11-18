# WebGuard

> Build with AI. Launch with confidence. Stay secure.

Security scanning for apps built with AI tools (Lovable, Bolt, Cursor) on Supabase and Vercel. Connect a GitHub repo or a live URL. WebGuard finds real issues and explains each one in plain language, with copy-paste fixes. A re-scan then verifies the fix.

## Run locally

Requirements: **Node 22+** (`nvm use`) and Docker.

```bash
npm install
npx supabase start          # local Postgres/Auth/Realtime + Mailpit; applies migrations
cp .env.example .env.local  # then paste the URL/keys printed by `supabase start`
npm run dev                 # http://localhost:3000
npm run worker              # in a second terminal: runs queued scans
```

Or use the Makefile, which does the same in one step and finds Node 22 even if your default `node` is older:

```bash
make up       # Supabase + web app + scan worker, applying any new migrations
make status   # what's running
make logs     # follow web and worker logs
make stop     # stop web and worker (Supabase keeps running)
make down     # stop everything, including Supabase (data is kept)
make check    # tests, typecheck, lint (safe while the dev server runs)
```

Sign in with a magic link. Locally, emails land in Mailpit at http://127.0.0.1:54324.

Optional settings in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Raises the GitHub API limit from 60 to 5,000 requests per hour, and allows scanning private repos the token can read |
| `NEXT_PUBLIC_GITHUB_AUTH_ENABLED` | Set to `true` after configuring `[auth.external.github]` in `supabase/config.toml` |
| `SCANNER_ALLOW_PRIVATE_TARGETS` | Development only: allows scanning `localhost` targets |

```bash
npm test            # analyzer unit tests
npm run typecheck
npm run lint
npm run db:types    # regenerate src/lib/database.types.ts after a migration
```

## What a scan checks (v1)

| Check | Source | Rule ids |
| --- | --- | --- |
| Leaked secrets (Stripe, OpenAI, Anthropic, AWS, GitHub, Slack, SendGrid, private keys) | Repo, live JS bundles | `hardcoded-secret` |
| Supabase `service_role` / `sb_secret_` key exposed | Repo, live JS bundles | `supabase-service-role-exposed` |
| Committed `.env` files | Repo | `env-file-committed` |
| Vulnerable npm-ecosystem dependencies (OSV database) | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` | `vulnerable-dependency` |
| API routes with admin database access and no auth check | Next.js `app/**/route.ts`, `pages/api/**`, Supabase Edge Functions | `unprotected-api-route` |
| RLS disabled or `using (true)` policies | `supabase/migrations/*.sql` | `supabase-rls-disabled`, `supabase-rls-permissive` |
| Missing security headers / no HTTPS | Live site | `missing-security-headers` |

These checks map onto WebGuard's 10 security areas (five have checks today). Each scan records which checks ran and why any were skipped, and the dashboard shows exactly that. See [docs/security-coverage.md](docs/security-coverage.md).

All live-site checks are **passive**: they make the same GET requests a visitor's browser makes. Active probes, such as requesting `/.env` or querying Supabase tables with the anon key, will require domain verification first.

**Coming next:** scheduled scans, scan-on-push (GitHub App), email alerts, and domain verification.

## Architecture

```
Browser (Next.js pages) ──reads via RLS──► Supabase Postgres ◄──service role── scan worker (src/worker, container)
        │                                      ▲   scans table = job queue          └─ scan engine (src/server/scanner)
        └─► /api/* route handlers ──inserts queued scan                                ├─ GitHub API (tarball, in memory, never executed or stored)
                                                                                       ├─ OSV API (advisories)
                                                                                       └─ target site (passive GETs, SSRF-guarded)
```

- **Scan queue:** the web app only inserts a `queued` scan row. The worker (`src/worker/main.ts`) claims scans with `claim_next_scan()` (`FOR UPDATE SKIP LOCKED`, so several workers never get the same scan), runs them, and writes progress to `scans.stage_index`, which the scan overlay polls. While a scan runs, the worker updates `heartbeat_at` every 30 seconds. Every minute, `recover_stale_scans()` requeues scans whose worker died (failing them after 2 attempts) and fails scans nobody picked up within 30 minutes. Every write to a scan row is fenced on `claimed_at`, so a worker that was declared dead cannot overwrite the run that replaced it.
- **Findings reconciliation** (`engine.ts`): each finding has a stable fingerprint. If an analyzer completes and no longer sees a finding, the finding is marked resolved. If it reappears later, it is reopened as a regression. If the analyzer did not run, its findings are left untouched.

| Path | Purpose |
| --- | --- |
| `supabase/migrations/` | Schema, RLS policies, column grants, status guard trigger |
| `src/server/scanner/` | Scan engine, analyzers, GitHub client, SSRF-safe HTTP |
| `src/lib/rules.ts` | Knowledge base: simple and technical explanations, fix steps, code examples |
| `src/lib/store.ts`, `src/lib/data.ts` | Browser data layer (Supabase) and the hooks pages use |
| `src/app/api/` | `detect`, `projects`, `projects/[id]/scans`, `account` |

## Security model

- **Users:** every table is scoped by RLS to `auth.uid()`. Users have SELECT access, plus narrow column grants: they can ignore or reopen findings and edit project settings. A trigger prevents users from marking findings resolved; only a scan can do that.
- **Server:** the service-role client is used only by the scan worker and account deletion, and only after an ownership check. The queue functions can only be called with the service role.
- **Secrets in evidence:** secrets are redacted before storage. Only a prefix and a SHA-256 fingerprint are kept.
- **Repository code:** read from a tarball in memory, never written to disk, never executed.
- **Outbound requests:** only http and https, only public IPs (re-checked on every redirect), with size and time limits.
# webguard-v1

## Deploying the scan worker

The worker runs outside Vercel as a small container with no public ports. `npm run worker:build` bundles it into `dist/worker.mjs` (Node only, no `node_modules`), and `Dockerfile.worker` packages that bundle.

Fly.io, one machine with 512 MB (`fly.worker.toml`):

```bash
fly launch --no-deploy --copy-config -c fly.worker.toml   # first time; pick a unique app name
fly secrets set -c fly.worker.toml NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GITHUB_TOKEN=...
fly deploy -c fly.worker.toml --ha=false
```

Set `primary_region` to your Supabase region. The image runs on any container host, and for a private beta the worker can simply run on your own machine with `npm run worker`. Scans queue until a worker is running, and fail with a clear message after 30 minutes.

