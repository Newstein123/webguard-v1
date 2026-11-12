import type { Rule } from "./types";

export const RULES: Rule[] = [
  {
    id: "supabase-rls-permissive",
    title: "Database policy lets anyone read or change every row",
    category: "Database",
    simple:
      "Your database has a rule that says “anyone can access this table.” Your app is supposed to show each user only their own data, but because of this rule, anyone who opens your website can ask the database directly for every row (names, emails, everything) and get it.",
    technical:
      "A permissive Row Level Security policy uses `using (true)` (or `with check (true)`) with no constraint tying rows to `auth.uid()`. When it is granted to `anon` or `public`, anyone holding the anon key, which Supabase ships to every browser by design, can call `/rest/v1/<table>?select=*` and receive every row. When granted to `authenticated`, anyone who can sign up gets the same access. The evidence shows the exact policy and migration file.",
    whyItMatters:
      "This is one of the most common data leaks in apps built on Supabase. Exposing personal or billing data can break privacy laws (GDPR, CCPA), destroy customer trust, and is trivially exploitable: no hacking skill required, just the browser’s dev tools.",
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
    category: "Secrets",
    simple:
      "Your app has two Supabase keys: a public one that’s safe to share, and a secret “master key” that ignores all your security rules. The master key ended up in the code that gets sent to every visitor’s browser, so anyone can copy it and do anything to your database.",
    technical:
      "A JWT with `role: service_role` was found in the client JavaScript bundle (`/assets/index-*.js`). The service_role key bypasses Row Level Security entirely. It is likely referenced via a `VITE_`/`NEXT_PUBLIC_` prefixed env var, which bundlers inline into client code.",
    whyItMatters:
      "With the service_role key, an attacker can read, modify, or delete every row in every table, and manage auth users. It’s the equivalent of publishing your database admin password.",
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
    category: "Secrets",
    simple:
      "A secret key for a paid service (like Stripe or OpenAI) is written directly in your code. Anyone who can see your code — including through GitHub history — can use it and run up charges or access your account.",
    technical:
      "A high-entropy string matching a known secret format was detected in a tracked source file. Even if removed in a later commit, it remains in git history and must be considered compromised.",
    whyItMatters:
      "Leaked Stripe keys can issue refunds or read customer payment data; leaked OpenAI keys are routinely abused within minutes, producing large bills.",
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
    category: "Headers & TLS",
    simple:
      "Browsers have built-in protections that websites can switch on by sending a few extra instructions. Your site isn’t sending them, so it’s easier for attackers to inject scripts or trick users with fake overlays.",
    technical:
      "The response for `/` lacks `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` and `Referrer-Policy` headers.",
    whyItMatters:
      "These headers are defense-in-depth against XSS, clickjacking, protocol downgrade, and MIME sniffing. They’re cheap to add and close entire classes of attacks.",
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
    category: "Dependencies",
    simple:
      "Your app uses a third-party package that has a publicly known security bug. The fix is usually just updating to a newer version.",
    technical:
      "A package version pinned in your lockfile matches one or more published advisories in the OSV database (GitHub Security Advisories, npm). WebGuard does not yet check whether the vulnerable function is actually called, so treat dev-only and unused packages as lower priority.",
    whyItMatters:
      "Known vulnerabilities come with public write-ups, so they’re the first thing automated attack tools try.",
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
    category: "Configuration",
    simple:
      "Your API tells browsers “any website is allowed to talk to me, including with the user’s login.” That means a malicious site could make requests to your API pretending to be your logged-in user.",
    technical:
      "The API reflects the request `Origin` header into `Access-Control-Allow-Origin` while also sending `Access-Control-Allow-Credentials: true`.",
    whyItMatters:
      "This enables cross-site data theft: any page a user visits can read their data from your API using their cookies.",
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
    category: "Auth & Access",
    simple:
      "One of your backend endpoints does something sensitive but never checks who’s asking. Anyone who finds the URL can use it, even without logging in.",
    technical:
      "The route handler performs privileged data access without verifying a session or token, and without an ownership check on the target resource (potential IDOR).",
    whyItMatters:
      "Broken access control is the #1 risk in the OWASP Top 10. Unauthenticated endpoints are routinely discovered by crawling your JavaScript bundle.",
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
    category: "Configuration",
    simple:
      "A file that should never be public — like your settings file or code history — can be downloaded by anyone just by typing its address.",
    technical:
      "An HTTP GET to a well-known sensitive path returned 200 with non-HTML content, indicating the file is served from the web root.",
    whyItMatters:
      "Exposed `.env` files leak every secret at once; exposed `.git` directories let attackers rebuild your whole source code.",
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
    category: "Auth & Access",
    simple:
      "The cookie that keeps users logged in isn’t locked down, so malicious scripts could read it or it could be sent over an insecure connection.",
    technical:
      "The `Set-Cookie` header for the session cookie lacks `HttpOnly`, `Secure`, and/or `SameSite` attributes.",
    whyItMatters:
      "A readable session cookie turns any XSS bug into a full account takeover.",
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
    category: "Configuration",
    simple:
      "When something goes wrong, your app shows the visitor technical details about its internals. That’s a roadmap for attackers.",
    technical:
      "Error responses include stack traces, file paths, and framework versions. `NODE_ENV` may not be set to `production`.",
    whyItMatters:
      "Leaked internals help attackers fingerprint your stack and find exploitable components faster.",
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
    category: "Auth & Access",
    simple:
      "Users can sign up with very short or common passwords like “123456,” making their accounts easy to guess.",
    technical:
      "Auth configuration allows passwords shorter than 8 characters and does not check against breached-password lists.",
    whyItMatters:
      "Credential stuffing and password spraying succeed overwhelmingly against weak passwords.",
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
    category: "Auth & Access",
    simple:
      "Your login page will send users to any website named in the link. Scammers can craft a link that looks like it goes to your site but drops users on a fake one.",
    technical:
      "The `next` / `redirect_to` query parameter is used in a redirect without validating that it’s a relative path or an allowlisted origin.",
    whyItMatters:
      "Open redirects make phishing far more convincing and can leak OAuth tokens.",
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
    category: "Database",
    simple:
      "One of your database tables has its security rules switched off. Supabase lets your website talk to the database directly, so with the rules off, anyone who visits your site can read, change, or delete everything in that table.",
    technical:
      "A table in the `public` schema is created by a migration but Row Level Security is never enabled. Supabase exposes `public` tables through PostgREST, and the anon key is shipped to every browser, so without RLS the table is fully readable and writable by the `anon` role (subject only to table grants).",
    whyItMatters:
      "This is the single most common cause of data leaks in Supabase apps. It needs no hacking skill: the anon key and project URL are visible in your site's JavaScript.",
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
    category: "Secrets",
    simple:
      "Your project's settings file (.env), which holds passwords and API keys, was saved into your code repository. Anyone who can see the repository, now or in the future, can read those keys.",
    technical:
      "A `.env` file containing non-empty values is tracked in git. Even after deleting it, the values remain in git history. Values are redacted in the evidence; only variable names are shown.",
    whyItMatters:
      "Repositories get made public, shared with contractors, or copied into AI tools. Every key in this file should be treated as leaked.",
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
