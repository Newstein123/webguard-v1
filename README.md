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
| Vulnerable npm dependencies (OSV database) | `package-lock.json` | `vulnerable-dependency` |
| RLS disabled or `using (true)` policies | `supabase/migrations/*.sql` | `supabase-rls-disabled`, `supabase-rls-permissive` |
| Missing security headers / no HTTPS | Live site | `missing-security-headers` |

All live-site checks are **passive**: they make the same GET requests a visitor's browser makes. Active probes, such as requesting `/.env` or querying Supabase tables with the anon key, will require domain verification first.

**Coming next:** scheduled scans, scan-on-push (GitHub App), email alerts, `pnpm` and `yarn` lockfiles, and domain verification.

## Architecture

```
Browser (Next.js pages) ──reads via RLS──► Supabase Postgres
        │                                      ▲
        └─► /api/* route handlers ──► scan engine (src/server/scanner) ──service role──┘
                                         ├─ GitHub API (tarball, parsed in memory, never executed or stored)
                                         ├─ OSV API (advisories)
                                         └─ target site (passive GETs, SSRF-guarded)
```

- Scans run in-process, after the response is sent (`after()`). Progress is written to `scans.stage_index` and polled by the scan overlay. Before deploying, this moves to a queue and worker.
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
- **Server:** the service-role client is used only by the scan engine and account deletion, and only after an ownership check.
- **Secrets in evidence:** secrets are redacted before storage. Only a prefix and a SHA-256 fingerprint are kept.
- **Repository code:** read from a tarball in memory, never written to disk, never executed.
- **Outbound requests:** only http and https, only public IPs (re-checked on every redirect), with size and time limits.
# webguard-v1
