# WebGuard security coverage

_Last updated: 2026-11-12 (v1 MVP)_

This page lists what a WebGuard scan checks today, where those checks have blind spots, and what is not covered yet. Update it whenever an analyzer is added or changed. The code lives in `src/server/scanner/analyzers/`.

> WebGuard reduces risk but cannot guarantee security. A clean scan means that **no known issues were found by the checks below**. It does not mean the app is secure.

## The 10 security areas

The dashboard reports coverage per area. Each scan stores what every check did (`scans.coverage`): it either **ran** (with what it examined) or was **skipped** (with the reason). The dashboard shows only what was stored, never what the project type implies. The mapping lives in `src/lib/coverage.ts`; keep it in sync with this page.

| # | Area | Checks today | Dashboard status when they all run |
|---|---|---|---|
| 1 | Code Security | none | Not checked yet |
| 2 | Authentication & Authorization | none | Not checked yet |
| 3 | API Security | `api-auth` | Checked |
| 4 | Database Security | `rls` | Checked |
| 5 | Secrets & Data Protection | `repo-secrets`, `site-bundle` | Checked (Partly checked if one is skipped) |
| 6 | Dependency Security | `deps` | Checked |
| 7 | Frontend Security | `site-headers` | Checked |
| 8 | Infrastructure Security | none | Not checked yet |
| 9 | File & Input Security | none | Not checked yet |
| 10 | Runtime & Business Logic | none | Not checked yet |

"Checked" means the area's checks ran, not that the area is fully covered: each check's scope and blind spots are listed below. Never add a placeholder check to fill an area. When a new analyzer ships, add it to `CHECKS` in `src/lib/coverage.ts` and return `check`, `scope` and `skipped` from the analyzer.

## ✅ Covered

| Area | What we check | Where | Rule id(s) |
|---|---|---|---|
| Leaked secrets | Stripe, OpenAI, Anthropic, AWS, GitHub, Slack and SendGrid keys, plus private keys | Repo code, live site's JS bundles | `hardcoded-secret` |
| Supabase admin key exposed | `service_role` JWT or `sb_secret_` key in client code or the browser bundle | Repo, live site | `supabase-service-role-exposed` |
| Committed `.env` files | Tracked `.env*` files with values (only variable names are stored) | Repo | `env-file-committed` |
| Database access rules (RLS) | Tables with RLS off; `using (true)` / `with check (true)` policies for `anon`, `public` or `authenticated` | `supabase/migrations/*.sql` | `supabase-rls-disabled`, `supabase-rls-permissive` |
| Vulnerable dependencies | Every npm-ecosystem package checked against the OSV advisory database, with the fixed version | `package-lock.json`, `pnpm-lock.yaml` (v5, v6, v9), `yarn.lock` (v1, Berry), `bun.lock` | `vulnerable-dependency` |
| API routes without auth | Routes that use admin database access (service-role key or admin client, Prisma, Drizzle, raw drivers, Firebase Admin; directly or via a local import) with no authentication or webhook-signature check | Next.js `app/**/route.ts`, `pages/api/**`, `supabase/functions/*` | `unprotected-api-route` |
| Browser security headers | HSTS, CSP, X-Frame-Options / frame-ancestors, X-Content-Type-Options, Referrer-Policy | Live site | `missing-security-headers` |
| HTTPS | Final page served over plain HTTP | Live site | `missing-security-headers` |

## 🟡 Partly covered (known blind spots)

| Area | Gap |
|---|---|
| Secrets | About 10 key formats; uncommon providers are missed. No check of whether a key still works. Only the current code is scanned, not git history. |
| RLS | Only what's in migrations: policies changed in the Supabase dashboard are invisible. Only literal `true` conditions are caught; weak conditions such as `user_id is not null` are missed. |
| Dependencies | Bun's old binary `bun.lockb` can't be read (the scan explains how to switch to the text `bun.lock`). Dev-only packages are recognised only in npm and pnpm v5/v6 lockfiles; elsewhere they keep full severity. No check of whether vulnerable code is actually used. npm ecosystem only. If any lockfile can't be parsed, the whole check is skipped rather than run on partial data. |
| API routes | Static and per-file: auth enforced in `middleware.ts` or in a helper with an unusual name may not be recognised (findings are lowered to medium when an auth middleware exists). Only privileged data access is flagged; routes using the user-scoped Supabase client rely on RLS. No ownership (IDOR) checks. Express, Hono and other servers are not analyzed yet. |
| Live site | Only the homepage and its own scripts. Pages behind login and lazily loaded code are not fetched. |
| Private repos | Only with a shared server `GITHUB_TOKEN`. A per-user GitHub App comes after the MVP. |

## ❌ Not covered

| Risk | Examples | Why not yet |
|---|---|---|
| Broken access control beyond missing auth | IDOR (reading another user's data by changing an ID), admin pages without role checks, Express/Hono routes | Needs deeper code-logic analysis. Missing auth on Next.js/Edge routes is now covered (see above) |
| Injection | SQL injection, XSS, command injection, SSRF in app code | Needs code analysis or active testing |
| Authentication setup | Weak password rules, missing email confirmation, open sign-ups, cookie flags, OAuth redirect settings | Knowledge-base rules exist, but no analyzer uses them yet |
| Active live-site checks | Exposed `/.env` or `/.git`, CORS misconfiguration, open redirects, verbose error pages | Deliberately off until domain verification exists |
| Live database checks | Querying Supabase tables with the public anon key to prove data is exposed | Active check, so it needs domain verification or a Supabase connection |
| Firebase security rules | `allow read, write: if true` | No Firebase analyzer yet |
| Storage buckets | Public Supabase Storage or S3 buckets holding private files | Not implemented |
| Business logic | Price tampering, skipping a payment step, abusing rate limits | Beyond automated scanning |
| Infrastructure | Vercel/Netlify settings, DNS, cloud IAM | Out of scope for v1 |
| Runtime protection | Blocking attacks, firewall, bot protection | Not our product: WebGuard **checks**, it doesn't **protect** |

## Next additions (by impact for Lovable and Supabase users)

| # | Addition | Effort | Why |
|---|---|---|---|
| 1 | Weaker RLS patterns (`user_id is not null`, missing `using` on update, policies on `auth.users`) | Small | Catches near-miss policies that still leak data |
| 2 | API-route auth for Express and Hono, and ownership (IDOR) checks | Medium | Extends the new route check to more servers and to "logged in, but someone else's data" |
| 3 | Domain verification | Medium | Unlocks dotfile, CORS and open-redirect checks, and a **live RLS proof** ("we read 1 row from `invoices` without logging in") |
| 4 | Firebase rules and Supabase Storage policies | Medium | Same class of data leak on other common backends |

## How to describe this publicly

| ✅ Say | ❌ Don't say |
|---|---|
| "Checks your app for the most common causes of data leaks in AI-built apps" | "Guarantees your app is secure" |
| "Each fix is confirmed by a re-scan" | "Protects your app" / "blocks attacks" |
| "Every finding comes with its evidence" | "Finds all vulnerabilities" |
| "Checks your code and your live site" | "Continuous monitoring" (until it ships) |

The landing page still claims "Continuous monitoring" (`src/app/(marketing)/page.tsx`) and "AI-assisted" (`src/app/layout.tsx`). Neither is true in v1, so fix both before a public launch.
