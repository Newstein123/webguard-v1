import type { Rule } from "./types";

export const RULES: Rule[] = [
  {
    id: "supabase-rls-permissive",
    title: "Database policy lets anyone read or change every row",
    category: "Database Security",
    simple:
      "Your database has a rule that says “anyone can access this table.” Your app is supposed to show each user only their own data, but because of this rule, anyone who opens your website can ask the database directly for every row (names, emails, everything) and get it.",
    technical:
      "A permissive Row Level Security policy uses `using (true)` (or `with check (true)`) with no constraint tying rows to `auth.uid()`. When it is granted to `anon` or `public`, anyone holding the anon key, which Supabase ships to every browser by design, can call `/rest/v1/<table>?select=*` and receive every row. When granted to `authenticated`, anyone who can sign up gets the same access. The evidence shows the exact policy and migration file.",
    whyItMatters:
      "This is one of the most common data leaks in apps built on Supabase. Exposing personal or billing data can break privacy laws (GDPR, CCPA), destroy customer trust, and is trivially exploitable: no hacking skill required, just the browser’s dev tools.",
    technicalTitle: "Permissive RLS policy: USING/WITH CHECK (true) not bound to auth.uid()",
    impact:
      "A stranger could download your users’ personal information, or change and delete their data, without logging in or hacking anything. You might only find out when a user complains or the data appears online.",
    rootCause:
      "The policy predicate evaluates to `true` for every row, so RLS is enabled but enforces nothing. Row ownership is never compared with the caller’s JWT (`auth.uid()`). This usually comes from a generated “Enable read access for all users” policy that was meant to be temporary.",
    attackScenario:
      "An attacker reads the project URL and anon key from your public JavaScript bundle, then sends `GET /rest/v1/<table>?select=*` with `apikey: <anon key>`. PostgREST runs as `anon` (or `authenticated` after a free sign-up), the permissive policy matches every row, and the full table is returned. Write policies let the attacker `PATCH`/`DELETE` arbitrary rows the same way.",
    remediation: [
      "Drop the permissive policy named in the evidence in a new migration. Do not edit migrations that have already been applied.",
      "Create per-command policies (`select`/`insert`/`update`/`delete`) scoped `to authenticated` with `using ((select auth.uid()) = user_id)`, and `with check` on insert and update.",
      "If data is genuinely public, restrict the public policy to the specific columns or rows intended (a view or a `published = true` predicate) rather than `true`.",
      "Add an index on the ownership column (`user_id`) so the policy predicate stays fast.",
      "Verify with two test users and the anon key that cross-tenant reads and writes return no rows.",
    ],
    cwe: [
      { id: "CWE-863", name: "Incorrect Authorization" },
      { id: "CWE-284", name: "Improper Access Control" },
    ],
    ai: {
      goal: "Change the database access rule shown above so that each signed-in user can only see and change their own rows, and visitors who are not logged in cannot access the table at all.",
      expected: [
        "No RLS policy on the affected table uses `true` as its USING or WITH CHECK expression.",
        "`anon` has no policy on the table; `authenticated` policies compare the ownership column with `(select auth.uid())`.",
        "INSERT and UPDATE policies have a WITH CHECK clause so users cannot write rows owned by someone else.",
      ],
      constraints: [
        "Make the change as a new SQL migration file in supabase/migrations/. Do not edit migrations that already ran.",
        "If the table has no ownership column (such as user_id), stop and tell me before adding one.",
      ],
      tests: {
        simple: [
          "Sign in as two different test users and check each one only sees their own data.",
          "Log out and check the data no longer loads.",
        ],
        technical: [
          "Using the anon key, `select *` on the table returns 0 rows (or a permission error).",
          "As user A, select/update/delete targeting user B’s rows affects 0 rows.",
          "As user A, inserting a row with user_id = B fails the WITH CHECK.",
          "Existing flows for the row owner still work (read, create, edit, delete own rows).",
        ],
      },
    },
    steps: [
      "Find the policy named in the evidence (Supabase dashboard → Authentication → Policies, or the migration file shown).",
      "Replace it with a policy that only allows users to reach rows they own (e.g. where `user_id = auth.uid()`).",
      "Make sure every table that stores user data has a `user_id` (or `org_id`) column you can filter on.",
      "Commit the fix as a new migration in `supabase/migrations/`, then test by signing in as two different users.",
      "Run a WebGuard re-scan to verify the policy is fixed.",
    ],
    examples: [
      {
        label: "Supabase SQL",
        lang: "sql",
        code: `-- Replace my_table and the policy name with the ones in the evidence
drop policy if exists "Enable read access for all users" on public.my_table;

-- Only let users read their own rows
create policy "Users can read own rows"
  on public.my_table
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- Same idea for writes
create policy "Users can insert own rows"
  on public.my_table
  for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );`,
      },
      {
        label: "Lovable prompt",
        lang: "text",
        code: `Update the Row Level Security policies on the <table name> table so that
authenticated users can only select, insert, update and delete rows
where user_id equals auth.uid(). Remove any policy that uses "true"
as its condition. Do not grant any access to the anon role.`,
      },
    ],
    references: [
      { label: "Supabase: Row Level Security", href: "https://supabase.com/docs/guides/database/postgres/row-level-security" },
    ],
  },
  {
    id: "supabase-service-role-exposed",
    title: "Supabase service_role key exposed in browser code",
    category: "Secrets & Data Protection",
    simple:
      "Your app has two Supabase keys: a public one that’s safe to share, and a secret “master key” that ignores all your security rules. The master key ended up in the code that gets sent to every visitor’s browser, so anyone can copy it and do anything to your database.",
    technical:
      "A JWT with `role: service_role` was found in the client JavaScript bundle (`/assets/index-*.js`). The service_role key bypasses Row Level Security entirely. It is likely referenced via a `VITE_`/`NEXT_PUBLIC_` prefixed env var, which bundlers inline into client code.",
    whyItMatters:
      "With the service_role key, an attacker can read, modify, or delete every row in every table, and manage auth users. It’s the equivalent of publishing your database admin password.",
    technicalTitle: "Supabase service_role credential exposed to client (RLS bypass)",
    impact:
      "Anyone who visits your site can take the master key and read, change or delete everything in your database, including other users’ accounts. Your security rules won’t stop them, because this key ignores them.",
    rootCause:
      "A credential that authenticates as the Postgres `service_role` (a JWT with `role: service_role`, or an `sb_secret_` key) is referenced from code that ships to the browser, typically through an env var with a client-exposed prefix (`NEXT_PUBLIC_`, `VITE_`, …) that the bundler inlines at build time.",
    attackScenario:
      "An attacker opens dev tools, searches the JS bundle for `eyJ` or `sb_secret_`, and uses the key as both `apikey` and `Authorization: Bearer` against `/rest/v1` and `/auth/v1/admin`. `service_role` has `BYPASSRLS`, so every table is readable and writable, and auth users can be listed, created or deleted.",
    remediation: [
      "Rotate the key in the Supabase dashboard first. The exposed value must be treated as compromised even after the code is fixed.",
      "Remove every client-prefixed env var holding the key; rename it to a server-only name such as `SUPABASE_SERVICE_ROLE_KEY`.",
      "Move privileged operations behind server-only code (route handlers, server actions, edge functions) guarded by `import \"server-only\"` and an auth check.",
      "Use the anon/publishable key plus RLS for all browser-side queries.",
      "Rebuild and redeploy, then confirm the key no longer appears in any served JS asset.",
    ],
    cwe: [
      { id: "CWE-798", name: "Use of Hard-coded Credentials" },
      { id: "CWE-522", name: "Insufficiently Protected Credentials" },
    ],
    ai: {
      goal: "Stop the Supabase admin (service_role) key from being sent to the browser. Browser code should only use the public anon key, and anything that really needs admin access should run on the server.",
      expected: [
        "No client bundle contains a service_role JWT or sb_secret_ key.",
        "The service_role key is only read from a server-only env var (no NEXT_PUBLIC_/VITE_/REACT_APP_/EXPO_PUBLIC_ prefix).",
        "Privileged operations run server-side, behind an authentication and authorization check.",
      ],
      constraints: ["Do not paste any key value into code, comments or config files. Refer to env var names only."],
      manual: [
        "Rotate (regenerate) the service_role key in the Supabase dashboard. The old one must be treated as leaked.",
        "Update the env var on your host with the new key, then redeploy.",
      ],
      tests: {
        simple: [
          "After deploying, run a WebGuard re-scan to check the key is gone from your site.",
          "Click through the features that changed and check they still work.",
        ],
        technical: [
          "Search the production build output (e.g. `.next/static`, `dist/assets`) for `service_role` and `sb_secret_`: no matches.",
          "Server routes that use the admin client return 401/403 without a valid session.",
          "Browser-side Supabase calls succeed with the anon key under RLS.",
        ],
      },
    },
    steps: [
      "Rotate the key immediately: Supabase dashboard → Project Settings → API → regenerate the service_role key (or JWT secret).",
      "Remove the key from any env var prefixed with `NEXT_PUBLIC_` or `VITE_`.",
      "Only use the service_role key in server-side code (API routes, edge functions, server actions).",
      "Redeploy and re-scan to confirm the key no longer appears in the bundle.",
    ],
    examples: [
      {
        label: "Next.js (server only)",
        lang: "ts",
        code: `// lib/supabase-admin.ts — import ONLY from server code
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // no NEXT_PUBLIC_ prefix
);`,
      },
      {
        label: ".env",
        lang: "bash",
        code: `# Safe for the browser
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon

# Server only — never prefix with NEXT_PUBLIC_ or VITE_
SUPABASE_SERVICE_ROLE_KEY=eyJ...service`,
      },
    ],
  },
  {
    id: "hardcoded-secret",
    title: "Hardcoded API secret committed to the repository",
    category: "Secrets & Data Protection",
    simple:
      "A secret key for a paid service (like Stripe or OpenAI) is written directly in your code. Anyone who can see your code — including through GitHub history — can use it and run up charges or access your account.",
    technical:
      "A high-entropy string matching a known secret format was detected in a tracked source file. Even if removed in a later commit, it remains in git history and must be considered compromised.",
    whyItMatters:
      "Leaked Stripe keys can issue refunds or read customer payment data; leaked OpenAI keys are routinely abused within minutes, producing large bills.",
    technicalTitle: "Hard-coded credential in source or client bundle",
    impact:
      "Someone could use your key to spend your money (for example running up an AI or payment bill), read your customers’ data from that service, or act as your app.",
    rootCause:
      "A credential literal matching a known high-confidence format (Stripe, OpenAI, Anthropic, AWS, GitHub, Slack, SendGrid, PEM private key) is stored in a tracked file or served JavaScript instead of being injected at runtime from a secret store or environment variable.",
    attackScenario:
      "Automated scanners continuously harvest keys from public GitHub commits and JS bundles; leaked keys are commonly abused within minutes. Git history keeps the value after deletion, so anyone with current or future read access to the repo can recover it.",
    remediation: [
      "Revoke or rotate the credential at the provider before anything else.",
      "Replace the literal with a runtime lookup (`process.env.X`) read only in server code; never use a client-exposed env prefix for secrets.",
      "Add the variable to the host’s secret store (Vercel / Netlify / Supabase secrets) per environment.",
      "Optionally purge the value from git history (`git filter-repo`) and enable push protection / secret scanning.",
    ],
    cwe: [{ id: "CWE-798", name: "Use of Hard-coded Credentials" }],
    ai: {
      goal: "Remove the secret key written directly in the code at the location above, and read it from an environment variable instead, only in server-side code.",
      expected: [
        "No credential literal remains in source; the value is read from an env var at runtime.",
        "The env var is only read in server-side code and has no client-exposed prefix.",
        "The app fails with a clear error at startup or first use if the env var is missing, rather than silently continuing.",
      ],
      constraints: [
        "Do not paste, print or log any key value. Use a placeholder env var name.",
        "Add the env var name (without a value) to .env.example if the project has one.",
      ],
      manual: [
        "Revoke or rotate the key in the provider’s dashboard. Assume the old one is already compromised.",
        "Add the new key as an environment variable in your hosting dashboard, then redeploy.",
      ],
      tests: {
        simple: ["Check the feature that uses this key still works after you add the new key to your hosting settings.", "Run a WebGuard re-scan to confirm the key is gone."],
        technical: [
          "Grep the repo and the production build output for the key prefix: no matches.",
          "The integration works end-to-end with the env var set, and fails loudly when it is unset.",
        ],
      },
    },
    steps: [
      "Revoke/rotate the key in the provider’s dashboard first — assume it’s already compromised.",
      "Move the new key into an environment variable on your host (Vercel → Settings → Environment Variables).",
      "Read it via `process.env` in server code only.",
      "Optionally purge it from git history with `git filter-repo`, and enable GitHub secret scanning.",
    ],
    examples: [
      {
        label: "Before / after",
        lang: "ts",
        code: `// ❌ Before
const stripe = new Stripe("sk_live_51Hc...xQ");

// ✅ After
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);`,
      },
    ],
  },
  {
    id: "missing-security-headers",
    title: "Missing security headers (CSP, HSTS, X-Frame-Options)",
    category: "Frontend Security",
    simple:
      "Browsers have built-in protections that websites can switch on by sending a few extra instructions. Your site isn’t sending them, so it’s easier for attackers to inject scripts or trick users with fake overlays.",
    technical:
      "The response for `/` lacks `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` and `Referrer-Policy` headers.",
    whyItMatters:
      "These headers are defense-in-depth against XSS, clickjacking, protocol downgrade, and MIME sniffing. They’re cheap to add and close entire classes of attacks.",
    technicalTitle: "Missing HTTP security response headers / no HTTPS",
    impact:
      "If another part of your site ever lets attackers inject content, these missing protections make it much easier for them to steal logins or trick visitors, for example by hiding your site inside a fake page. Without HTTPS, anyone on the same Wi-Fi can read or change what your visitors see.",
    rootCause:
      "The server or hosting config does not emit browser hardening headers on HTML responses (CSP, HSTS, framing control, `nosniff`, Referrer-Policy), or the final response is served over plain HTTP. The evidence lists exactly which headers were present and missing on the observed response.",
    attackScenario:
      "Without CSP, any HTML-injection bug becomes script execution. Without `frame-ancestors`/`X-Frame-Options`, the site can be framed for clickjacking. Without HSTS, a network attacker can downgrade the first request to HTTP and strip TLS. Without `nosniff`, user-uploaded content can be MIME-sniffed into script.",
    remediation: [
      "Set headers centrally (framework `headers()` config, `vercel.json`, `_headers`, or reverse proxy) so every route is covered.",
      "Redirect all HTTP to HTTPS and add `Strict-Transport-Security: max-age=63072000; includeSubDomains` once HTTPS works on every subdomain.",
      "Roll out CSP as `Content-Security-Policy-Report-Only` first, collect violations, then enforce. Include `frame-ancestors 'none'` (or an allowlist).",
      "Add `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.",
    ],
    cwe: [
      { id: "CWE-693", name: "Protection Mechanism Failure" },
      { id: "CWE-1021", name: "Improper Restriction of Rendered UI Layers or Frames" },
      { id: "CWE-319", name: "Cleartext Transmission of Sensitive Information" },
    ],
    ai: {
      goal: "Add the standard browser security headers to every page of the site (and make sure the site is only served over HTTPS), using the project’s framework or hosting configuration.",
      expected: [
        "Every HTML response includes the headers listed as missing in the evidence.",
        "HTTP requests redirect to HTTPS; HSTS is only sent over HTTPS.",
        "CSP does not break existing scripts, styles, fonts, images or third-party integrations (start report-only if unsure).",
      ],
      constraints: [
        "Configure headers in one central place rather than per page.",
        "List every third-party domain the app loads from before writing the CSP, and do not use `unsafe-eval` unless the framework requires it.",
      ],
      tests: {
        simple: ["Open your site and click through the main pages to make sure everything still looks and works the same.", "Run a WebGuard re-scan to confirm the headers are present."],
        technical: [
          "`curl -sI https://<site>/` shows each required header.",
          "The browser console shows no CSP violations on core pages (or only expected report-only ones).",
          "`curl -sI http://<site>/` returns a 301/308 to https.",
        ],
      },
    },
    steps: [
      "Add security headers in your framework or host config.",
      "Start CSP in report-only mode, then tighten it once nothing breaks.",
      "Re-scan to confirm the headers are present.",
    ],
    examples: [
      {
        label: "next.config.ts",
        lang: "ts",
        code: `const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'" },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};`,
      },
      {
        label: "vercel.json",
        lang: "json",
        code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}`,
      },
    ],
  },
  {
    id: "vulnerable-dependency",
    title: "Dependency with a known vulnerability",
    category: "Dependency Security",
    simple:
      "Your app uses a third-party package that has a publicly known security bug. The fix is usually just updating to a newer version.",
    technical:
      "A package version pinned in your lockfile matches one or more published advisories in the OSV database (GitHub Security Advisories, npm). WebGuard does not yet check whether the vulnerable function is actually called, so treat dev-only and unused packages as lower priority.",
    whyItMatters:
      "Known vulnerabilities come with public write-ups, so they’re the first thing automated attack tools try.",
    technicalTitle: "Dependency with known published vulnerability (OSV advisory match)",
    impact:
      "Attackers use automated tools that look for apps using this exact package version. Depending on the bug, they might crash your app, read data they shouldn’t, or run their own code on your server.",
    rootCause:
      "The resolved version in the lockfile falls inside the affected range of one or more OSV advisories. WebGuard matches versions only. It does not check whether the vulnerable code path is reachable from your app.",
    attackScenario:
      "Public advisories include affected versions and often proof-of-concept details, so exploitation is commonly automated. Impact depends on the specific advisory (see IDs in the evidence) and on whether the package runs in production, at build time only, or in dev tooling.",
    remediation: [
      "Upgrade to the patched version listed in the evidence (or later). For transitive dependencies, upgrade the direct parent or use `overrides` / `resolutions`.",
      "Read each advisory to judge exploitability in your context; dev-only and build-only packages are lower priority.",
      "If no patched version exists, assess mitigations (disable the feature, input validation) or replace the package.",
      "Regenerate and commit the lockfile, then run the test suite.",
    ],
    cwe: [{ id: "CWE-1395", name: "Dependency on Vulnerable Third-Party Component" }],
    ai: {
      goal: "Update the package named above to the fixed version so the known security bug is removed, without breaking the app.",
      expected: [
        "The lockfile resolves the package to the patched version from the evidence (or later).",
        "No other packages are upgraded across major versions unless required by the fix.",
      ],
      constraints: [
        "Use the project’s existing package manager and commit the updated lockfile.",
        "If the fix needs a major-version upgrade, list the breaking changes that affect this codebase before changing code.",
      ],
      tests: {
        simple: ["Run the app and click through the main features to make sure nothing broke.", "Run a WebGuard re-scan to confirm the warning is gone."],
        technical: [
          "`npm ls <package>` shows only patched versions.",
          "`npm audit` no longer reports the advisory IDs from the evidence.",
          "Build, type-check and the existing test suite pass.",
        ],
      },
    },
    steps: [
      "Update the package to the patched version shown in the evidence.",
      "Run your tests / click through the app to make sure nothing broke.",
      "Commit the updated lockfile, then run a WebGuard re-scan to confirm.",
    ],
    examples: [
      {
        label: "npm",
        lang: "bash",
        code: `npm install axios@^1.8.2
npm audit`,
      },
    ],
  },
  {
    id: "cors-wildcard-credentials",
    title: "CORS allows any website to make authenticated requests",
    category: "API Security",
    simple:
      "Your API tells browsers “any website is allowed to talk to me, including with the user’s login.” That means a malicious site could make requests to your API pretending to be your logged-in user.",
    technical:
      "The API reflects the request `Origin` header into `Access-Control-Allow-Origin` while also sending `Access-Control-Allow-Credentials: true`.",
    whyItMatters:
      "This enables cross-site data theft: any page a user visits can read their data from your API using their cookies.",
    technicalTitle: "CORS origin reflection with Access-Control-Allow-Credentials",
    impact:
      "A harmful website your user visits could quietly pull their private data from your app while they’re logged in, without them noticing.",
    rootCause:
      "The CORS middleware echoes the request `Origin` into `Access-Control-Allow-Origin` (or uses a permissive matcher) while also returning `Access-Control-Allow-Credentials: true`.",
    attackScenario:
      "A victim visits attacker.example, which runs `fetch('https://api.yourapp/me', { credentials: 'include' })`. The browser attaches the victim’s cookies, your API reflects the attacker’s origin, and the browser lets the attacker’s script read the response.",
    remediation: [
      "Replace origin reflection with an explicit allowlist of exact origins.",
      "Only send `Access-Control-Allow-Credentials: true` for allowlisted origins.",
      "Add `Vary: Origin` so caches do not mix responses between origins.",
    ],
    cwe: [{ id: "CWE-942", name: "Permissive Cross-domain Policy with Untrusted Domains" }],
    ai: {
      goal: "Change the API’s cross-site settings (CORS) so only my own website’s addresses can make logged-in requests to it.",
      expected: [
        "Only exact allowlisted origins receive `Access-Control-Allow-Origin`.",
        "Credentials are never allowed for non-allowlisted origins.",
      ],
      constraints: ["Read the allowlist from configuration (env var) so dev, preview and production origins can differ."],
      tests: {
        simple: ["Check your website can still talk to your API after the change."],
        technical: [
          "A request with `Origin: https://evil.example` gets no `Access-Control-Allow-Origin` header.",
          "A request from each allowlisted origin still succeeds with credentials.",
        ],
      },
    },
    steps: [
      "Replace the wildcard / reflected origin with an explicit allowlist of your own domains.",
      "Only enable credentials for origins on the allowlist.",
    ],
    examples: [
      {
        label: "Express",
        lang: "ts",
        code: `import cors from "cors";

const allowlist = ["https://app.example.com"];

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowlist.includes(origin)),
  credentials: true,
}));`,
      },
    ],
  },
  {
    id: "unprotected-api-route",
    title: "API route has no authentication check",
    category: "API Security",
    simple:
      "One of your backend endpoints does something sensitive but never checks who’s asking. Anyone who finds the URL can use it, even without logging in.",
    technical:
      "The route handler performs privileged data access without verifying a session or token, and without an ownership check on the target resource (potential IDOR).",
    whyItMatters:
      "Broken access control is the #1 risk in the OWASP Top 10. Unauthenticated endpoints are routinely discovered by crawling your JavaScript bundle.",
    technicalTitle: "Missing authentication / authorization on API route (potential IDOR)",
    impact:
      "Anyone who finds this address could use it to see or change data without logging in, including other users’ data.",
    rootCause:
      "The handler performs privileged reads or writes without verifying a session or token, and without checking that the caller owns the targeted resource.",
    attackScenario:
      "An attacker finds the route in your JS bundle or network traffic, then calls it directly without a session, or with their own session but another user’s resource id, and the handler executes the action.",
    remediation: [
      "Authenticate at the top of the handler and return 401 when there is no valid session.",
      "Authorize per resource: scope queries by the caller’s id or check ownership, and return 403/404 otherwise.",
      "Prefer database-level enforcement (RLS) in addition to handler checks.",
      "Add negative tests for unauthenticated and cross-user access.",
    ],
    cwe: [
      { id: "CWE-306", name: "Missing Authentication for Critical Function" },
      { id: "CWE-639", name: "Authorization Bypass Through User-Controlled Key" },
    ],
    ai: {
      goal: "Make this API endpoint check that the user is logged in, and that they’re only acting on their own data, before it does anything.",
      expected: [
        "Requests without a valid session receive 401 and perform no work.",
        "Requests for resources owned by another user receive 403 or 404 and perform no work.",
      ],
      constraints: ["Reuse the project’s existing auth helper rather than writing a new one."],
      tests: {
        simple: ["Check the feature still works when you’re logged in.", "Check it stops working when you’re logged out."],
        technical: ["Unauthenticated request → 401.", "Authenticated request for another user’s resource → 403/404.", "Owner request → unchanged success response."],
      },
    },
    steps: [
      "Verify the user’s session at the top of the handler and return 401 if missing.",
      "Check the user owns the resource they’re acting on; return 403 otherwise.",
      "Add a test that calls the endpoint without auth and expects 401.",
    ],
    examples: [
      {
        label: "Next.js route",
        lang: "ts",
        code: `export async function DELETE(req: Request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id); // ownership check
  if (error) return new Response("Forbidden", { status: 403 });
  return new Response(null, { status: 204 });
}`,
      },
      {
        label: "Express",
        lang: "ts",
        code: `function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).end();
  next();
}

app.delete("/api/users/:id", requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && !req.user.isAdmin)
    return res.status(403).end();
  // ...
});`,
      },
    ],
  },
  {
    id: "exposed-dotfiles",
    title: "Sensitive file publicly accessible on deployed site",
    category: "Infrastructure Security",
    simple:
      "A file that should never be public — like your settings file or code history — can be downloaded by anyone just by typing its address.",
    technical:
      "An HTTP GET to a well-known sensitive path returned 200 with non-HTML content, indicating the file is served from the web root.",
    whyItMatters:
      "Exposed `.env` files leak every secret at once; exposed `.git` directories let attackers rebuild your whole source code.",
    technicalTitle: "Sensitive file served from web root",
    impact:
      "Someone could download your passwords and API keys, or a copy of your app’s source code, just by typing the right address.",
    rootCause:
      "A sensitive file (e.g. `.env`, `.git/`) is inside the directory the web server or host serves statically, and no rule blocks dotfile paths.",
    attackScenario:
      "Bots routinely request `/.env`, `/.git/config` and similar paths on every site they find. A 200 response with file contents leaks secrets directly, or lets the attacker rebuild the repository from `.git` objects.",
    remediation: [
      "Remove the file from the deployed/static directory and from the build output.",
      "Rotate any secrets the file contained.",
      "Deny dotfile paths at the server or host level.",
    ],
    cwe: [
      { id: "CWE-538", name: "Insertion of Sensitive Information into Externally-Accessible File or Directory" },
      { id: "CWE-527", name: "Exposure of Version-Control Repository to an Unauthorized Control Sphere" },
    ],
    ai: {
      goal: "Make sure the file shown above is no longer published with the website, and block access to hidden files (names starting with a dot).",
      expected: ["Requests for the affected path and other dotfiles return 404/403.", "The file is not present in build or deploy output."],
      manual: ["Rotate every secret that was in the exposed file."],
      tests: {
        simple: ["Open the file’s address in your browser and check it no longer downloads."],
        technical: ["`curl -I https://<site>/<path>` returns 403/404.", "The build output directory contains no dotfiles."],
      },
    },
    steps: [
      "Remove the file from your public/static directory.",
      "Rotate any secrets it contained.",
      "Configure your server to deny access to dotfiles.",
    ],
    examples: [
      {
        label: "nginx",
        lang: "nginx",
        code: `location ~ /\\. {
  deny all;
  return 404;
}`,
      },
    ],
  },
  {
    id: "insecure-cookies",
    title: "Session cookie missing Secure / HttpOnly flags",
    category: "Authentication & Authorization",
    simple:
      "The cookie that keeps users logged in isn’t locked down, so malicious scripts could read it or it could be sent over an insecure connection.",
    technical:
      "The `Set-Cookie` header for the session cookie lacks `HttpOnly`, `Secure`, and/or `SameSite` attributes.",
    whyItMatters:
      "A readable session cookie turns any XSS bug into a full account takeover.",
    technicalTitle: "Session cookie missing HttpOnly / Secure / SameSite attributes",
    impact:
      "If an attacker manages to run code on your site, or a user is on an unsafe network, they could steal the login cookie and take over that user’s account.",
    rootCause: "The session cookie is issued without `HttpOnly`, `Secure` and/or `SameSite`, so it is readable by JavaScript, sendable over HTTP, or attached to cross-site requests.",
    attackScenario: "An XSS payload reads `document.cookie` and sends the session token to the attacker, who replays it to impersonate the user.",
    remediation: ["Issue session cookies with `HttpOnly`, `Secure` and `SameSite=Lax` (or `Strict`).", "Rotate existing sessions after deploying the change."],
    cwe: [
      { id: "CWE-1004", name: "Sensitive Cookie Without 'HttpOnly' Flag" },
      { id: "CWE-614", name: "Sensitive Cookie in HTTPS Session Without 'Secure' Attribute" },
    ],
    ai: {
      goal: "Lock down the login cookie so browser scripts can’t read it and it’s only sent over secure connections.",
      expected: ["The session cookie is set with HttpOnly, Secure and SameSite=Lax or Strict."],
      tests: {
        simple: ["Log in and out to check it still works."],
        technical: ["The `Set-Cookie` header for the session includes `HttpOnly; Secure; SameSite=Lax`.", "`document.cookie` in the browser console does not contain the session token."],
      },
    },
    steps: [
      "Set `httpOnly: true`, `secure: true`, `sameSite: 'lax'` when issuing the cookie.",
    ],
    examples: [
      {
        label: "Express",
        lang: "ts",
        code: `res.cookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 1000 * 60 * 60 * 24 * 7,
});`,
      },
    ],
  },
  {
    id: "verbose-errors",
    title: "Detailed error messages shown to visitors",
    category: "Code Security",
    simple:
      "When something goes wrong, your app shows the visitor technical details about its internals. That’s a roadmap for attackers.",
    technical:
      "Error responses include stack traces, file paths, and framework versions. `NODE_ENV` may not be set to `production`.",
    whyItMatters:
      "Leaked internals help attackers fingerprint your stack and find exploitable components faster.",
    technicalTitle: "Verbose error responses disclose stack traces and internals",
    impact: "Attackers get a map of how your app is built, which helps them find weak spots faster.",
    rootCause: "Unhandled errors are serialized to the client with stack traces, file paths or framework versions, often because the app runs in development mode in production.",
    attackScenario: "An attacker sends malformed input to trigger errors, then uses the leaked paths, library versions and query fragments to pick known exploits or craft injection payloads.",
    remediation: ["Run with `NODE_ENV=production`.", "Add a global error handler that logs details server-side and returns a generic message with a correlation id."],
    cwe: [{ id: "CWE-209", name: "Generation of Error Message Containing Sensitive Information" }],
    ai: {
      goal: "Make the app show a simple, friendly error message to visitors when something goes wrong, while keeping the full details only in the server logs.",
      expected: ["Client-facing error responses contain no stack traces, file paths or internal messages.", "Full error details are still logged server-side."],
      tests: {
        simple: ["Trigger an error (e.g. visit a broken link) and check only a friendly message appears."],
        technical: ["Force a 500 and confirm the response body contains no stack trace.", "Confirm the server log still records the full error."],
      },
    },
    steps: [
      "Set `NODE_ENV=production` in your deployment.",
      "Return generic error messages to clients; log details server-side.",
    ],
    examples: [
      {
        label: "Express",
        lang: "ts",
        code: `app.use((err, req, res, next) => {
  console.error(err);            // full detail in logs
  res.status(500).json({ error: "Something went wrong" });
});`,
      },
    ],
  },
  {
    id: "weak-password-policy",
    title: "Weak password requirements",
    category: "Authentication & Authorization",
    simple:
      "Users can sign up with very short or common passwords like “123456,” making their accounts easy to guess.",
    technical:
      "Auth configuration allows passwords shorter than 8 characters and does not check against breached-password lists.",
    whyItMatters:
      "Credential stuffing and password spraying succeed overwhelmingly against weak passwords.",
    technicalTitle: "Weak password policy (short length, no breached-password check)",
    impact: "Attackers could guess or reuse common passwords to break into your users’ accounts.",
    rootCause: "The auth provider is configured with a low minimum length and no leaked-password check.",
    attackScenario: "Credential-stuffing and password-spraying tools try lists of breached and common passwords against the login endpoint; weak policies make many accounts guessable.",
    remediation: ["Raise the minimum length to at least 8 (12+ recommended).", "Enable leaked-password protection.", "Keep login rate limiting enabled."],
    cwe: [{ id: "CWE-521", name: "Weak Password Requirements" }],
    ai: {
      goal: "Require stronger passwords when people sign up or change their password.",
      expected: ["New passwords shorter than the minimum length are rejected with a helpful message."],
      constraints: ["Existing users must still be able to sign in; only new or changed passwords are checked."],
      tests: {
        simple: ["Try signing up with a short password like “123456” and check it’s refused."],
        technical: ["Sign-up with a password below the minimum length fails.", "Sign-up with a strong password succeeds."],
      },
    },
    steps: [
      "Require a minimum of 8 characters (12+ recommended).",
      "Enable leaked-password protection (Supabase: Auth → Providers → Email).",
    ],
    examples: [
      {
        label: "Supabase config.toml",
        lang: "toml",
        code: `[auth.email]
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits"`,
      },
    ],
  },
  {
    id: "open-redirect",
    title: "Open redirect in login flow",
    category: "Authentication & Authorization",
    simple:
      "Your login page will send users to any website named in the link. Scammers can craft a link that looks like it goes to your site but drops users on a fake one.",
    technical:
      "The `next` / `redirect_to` query parameter is used in a redirect without validating that it’s a relative path or an allowlisted origin.",
    whyItMatters:
      "Open redirects make phishing far more convincing and can leak OAuth tokens.",
    technicalTitle: "Open redirect via unvalidated redirect parameter",
    impact: "Scammers could send your users a real-looking link to your site that secretly sends them to a fake login page.",
    rootCause: "A user-controlled parameter (`next`, `redirect_to`, …) is passed to a redirect without checking it is a same-site relative path or an allowlisted origin.",
    attackScenario: "An attacker sends `https://yourapp/login?next=https://evil.example`. After login, the user lands on a phishing page that looks trusted because the link started on your domain.",
    remediation: ["Only accept relative paths starting with a single `/` (reject `//` and `/\\`).", "Fall back to a safe default on failure."],
    cwe: [{ id: "CWE-601", name: "URL Redirection to Untrusted Site ('Open Redirect')" }],
    ai: {
      goal: "Make the login redirect only send people to pages on my own site, never to other websites.",
      expected: ["Redirect targets that are absolute URLs or protocol-relative (`//…`) fall back to a safe default page."],
      tests: {
        simple: ["Log in normally and check you land on the right page."],
        technical: ["`?next=https://evil.example` redirects to the default page.", "`?next=//evil.example` redirects to the default page.", "`?next=/settings` redirects to /settings."],
      },
    },
    steps: [
      "Only allow relative paths starting with a single `/`.",
      "Fall back to a safe default if validation fails.",
    ],
    examples: [
      {
        label: "TypeScript",
        lang: "ts",
        code: `function safeRedirect(target: string | null) {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/dashboard";
  return target;
}`,
      },
    ],
  },
  {
    id: "supabase-rls-disabled",
    title: "Database table has no access rules (RLS is off)",
    category: "Database Security",
    simple:
      "One of your database tables has its security rules switched off. Supabase lets your website talk to the database directly, so with the rules off, anyone who visits your site can read, change, or delete everything in that table.",
    technical:
      "A table in the `public` schema is created by a migration but Row Level Security is never enabled. Supabase exposes `public` tables through PostgREST, and the anon key is shipped to every browser, so without RLS the table is fully readable and writable by the `anon` role (subject only to table grants).",
    whyItMatters:
      "This is the single most common cause of data leaks in Supabase apps. It needs no hacking skill: the anon key and project URL are visible in your site's JavaScript.",
    technicalTitle: "Row Level Security disabled on table exposed via PostgREST",
    impact:
      "A stranger could download, change or delete everything in this table without logging in or hacking anything. You might only find out when a user complains or the data appears online.",
    rootCause:
      "The table lives in the `public` schema, which Supabase exposes through PostgREST, but no migration runs `alter table … enable row level security`. With RLS off, access depends only on table grants, and Supabase grants `anon` and `authenticated` access to `public` tables by default.",
    attackScenario:
      "An attacker reads the project URL and anon key from your public JavaScript bundle and calls `/rest/v1/<table>?select=*`, then `PATCH`/`DELETE` with `apikey: <anon key>`. No policies are evaluated, so every row is readable and writable.",
    remediation: [
      "Enable RLS on the table in a new migration (`alter table public.<table> enable row level security`).",
      "Add explicit per-command policies scoped `to authenticated` using `(select auth.uid()) = user_id`; with RLS on and no policies, access is denied by default.",
      "If the table should not be reachable from the browser at all, also `revoke all on public.<table> from anon, authenticated`.",
      "Verify with the anon key and two test users.",
    ],
    cwe: [
      { id: "CWE-862", name: "Missing Authorization" },
      { id: "CWE-284", name: "Improper Access Control" },
    ],
    ai: {
      goal: "Turn on the database security rules (Row Level Security) for the table above, and add rules so each signed-in user can only see and change their own rows.",
      expected: [
        "RLS is enabled on the affected table.",
        "Policies exist for each operation the app needs, scoped to `authenticated` and comparing the ownership column with `(select auth.uid())`.",
        "`anon` cannot read or write the table.",
      ],
      constraints: [
        "Make the change as a new SQL migration file in supabase/migrations/. Do not edit migrations that already ran.",
        "If the table has no ownership column (such as user_id), stop and tell me before adding one.",
      ],
      tests: {
        simple: [
          "Sign in as two different test users and check each one only sees their own data.",
          "Check the parts of the app that use this table still work.",
        ],
        technical: [
          "`select relrowsecurity from pg_class where relname = '<table>'` returns true.",
          "Using the anon key, select/insert on the table returns 0 rows or a permission error.",
          "As user A, operations on user B’s rows affect 0 rows.",
        ],
      },
    },
    steps: [
      "Enable RLS on the table (SQL below, or Supabase dashboard → Table Editor → the table → Enable RLS).",
      "Add policies that only let users reach their own rows, usually `user_id = auth.uid()`.",
      "Commit the change as a new migration in `supabase/migrations/` so it is tracked.",
      "Run a WebGuard re-scan to verify.",
    ],
    examples: [
      {
        label: "Supabase SQL",
        lang: "sql",
        code: `alter table public.my_table enable row level security;

create policy "Users can read own rows"
  on public.my_table for select
  to authenticated
  using ( (select auth.uid()) = user_id );`,
      },
      {
        label: "Lovable prompt",
        lang: "text",
        code: `Enable Row Level Security on every table in the public schema.
For each table that stores user data, add policies so authenticated
users can only select, insert, update and delete rows where user_id
equals auth.uid(). Do not grant any access to the anon role.`,
      },
    ],
    references: [
      { label: "Supabase: Row Level Security", href: "https://supabase.com/docs/guides/database/postgres/row-level-security" },
    ],
  },
  {
    id: "env-file-committed",
    title: "Environment file with secrets committed to the repository",
    category: "Secrets & Data Protection",
    simple:
      "Your project's settings file (.env), which holds passwords and API keys, was saved into your code repository. Anyone who can see the repository, now or in the future, can read those keys.",
    technical:
      "A `.env` file containing non-empty values is tracked in git. Even after deleting it, the values remain in git history. Values are redacted in the evidence; only variable names are shown.",
    whyItMatters:
      "Repositories get made public, shared with contractors, or copied into AI tools. Every key in this file should be treated as leaked.",
    technicalTitle: "Environment file with secrets tracked in version control",
    impact:
      "Anyone who sees your code, now or later, could use the passwords and keys in this file to get into your database, payment account or other services.",
    rootCause:
      "A `.env` file with non-empty values is committed to git instead of being ignored. Deleting it later does not remove the values from history.",
    attackScenario:
      "The repository is made public, shared with a contractor, forked, or pasted into a third-party tool. Anyone with read access runs `git log -p -- .env` and recovers every value ever committed.",
    remediation: [
      "Rotate every credential listed (variable names are in the evidence).",
      "`git rm --cached` the file and add `.env*` / `!.env.example` to `.gitignore`.",
      "Provide a `.env.example` with names only.",
      "Optionally rewrite history with `git filter-repo` and force-push, coordinating with collaborators.",
    ],
    cwe: [
      { id: "CWE-540", name: "Inclusion of Sensitive Information in Source Code" },
      { id: "CWE-798", name: "Use of Hard-coded Credentials" },
    ],
    ai: {
      goal: "Stop tracking the environment file shown above in git, make git ignore it from now on, and add an example file that lists the variable names without any values.",
      expected: [
        "The env file is untracked and matched by .gitignore.",
        "A .env.example lists variable names with empty values.",
      ],
      constraints: [
        "Do not delete the local .env file from disk, only stop tracking it.",
        "Do not copy any values from the .env file into other files, comments or your reply.",
      ],
      manual: [
        "Rotate every key and password listed in the file in each provider’s dashboard.",
        "Put the new values in your hosting provider’s environment variable settings.",
      ],
      tests: {
        simple: ["Check the app still starts locally with your .env file.", "Run a WebGuard re-scan to confirm the file is no longer tracked."],
        technical: ["`git ls-files | grep -E '(^|/)\\.env'` lists only template files.", "`git check-ignore .env` reports the file as ignored."],
      },
    },
    steps: [
      "Rotate every secret listed in the file in each provider's dashboard.",
      "Delete the file from the repo: `git rm --cached .env` and commit.",
      "Add `.env*` (and `!.env.example`) to `.gitignore`.",
      "Store the new values in your host's environment variable settings (Vercel, Netlify, Lovable secrets).",
    ],
    examples: [
      {
        label: "Terminal",
        lang: "bash",
        code: `git rm --cached .env
echo ".env*" >> .gitignore
echo "!.env.example" >> .gitignore
git commit -m "Stop tracking .env"`,
      },
    ],
  },
];

export const RULES_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.id, r]));
