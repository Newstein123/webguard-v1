import type { AnalyzerResult, RawFinding, RepoFile, RepoSnapshot } from "../types";
import { scanText } from "../secrets";

/**
 * API routes that reach the database with admin privileges but never check
 * who is calling.
 *
 * Flags a route only when all of these hold (precision over recall):
 *  1. it uses privileged data access: the Supabase service-role key or an
 *     admin client, Prisma, Drizzle, a raw SQL/Mongo driver or Firebase Admin,
 *     directly or through a local module it imports (one level);
 *  2. no authentication or caller verification appears in the handler;
 *  3. it is not an endpoint that is public by design (auth callbacks, sign-up,
 *     health checks).
 * A route using the user-scoped Supabase client is not flagged: RLS still
 * applies to it, and the RLS analyzer covers that.
 *
 * Covers Next.js App Router route handlers, pages/api routes and Supabase
 * Edge Functions. Express and other servers are not analyzed yet.
 */
export const ID = "api-auth";

interface Route {
  file: RepoFile;
  kind: "app" | "pages" | "edge";
  endpoint: string;
  methods: string[];
}

const SRC_EXT = String.raw`\.(?:ts|tsx|js|jsx|mjs)`;
const APP_ROUTE = new RegExp(String.raw`(?:^|/)app/(.*?)/?route${SRC_EXT}$`);
const PAGES_API = new RegExp(String.raw`(?:^|/)pages/api/(.+?)${SRC_EXT}$`);
const EDGE_FN = new RegExp(String.raw`(?:^|/)supabase/functions/([^/_][^/]*)/index${SRC_EXT}$`);
const TEST_FILE = /(^|\/)(__tests__|tests?|__mocks__|fixtures?)\/|\.(test|spec)\.[jt]sx?$/;

/** Endpoints that are unauthenticated by design ("auth" covers /auth/callback and /api/auth/[...nextauth]). */
const PUBLIC_ENDPOINT = /(^|\/)(auth|oauth|login|logout|signin|sign-in|signup|sign-up|register|reset-password|verify-email|health|healthz|ping|og)(\/|$)/i;

/** Privileged data access inside a file. */
const PRIVILEGED: { re: RegExp; label: string }[] = [
  { re: /SERVICE_ROLE|service_role|sb_secret_|SUPABASE_SECRET_KEY/, label: "Supabase service-role key (bypasses RLS)" },
  { re: /\b(supabaseAdmin|createAdminClient|getAdminClient|createServiceClient|createServiceRoleClient|serviceRoleClient)\b/, label: "Supabase admin client (bypasses RLS)" },
  { re: /from\s+["']@prisma\/client["']|\bprisma\.\w+\.(find\w*|create\w*|update\w*|delete\w*|upsert|count|aggregate|groupBy)\s*\(|\bprisma\.\$(queryRaw|executeRaw)/, label: "Prisma (full database access)" },
  { re: /from\s+["'](drizzle-orm[^"']*|kysely|knex|pg|postgres|mysql2[^"']*|@neondatabase\/serverless|@vercel\/postgres|@planetscale\/database|mongodb|mongoose)["']/, label: "direct database driver (full database access)" },
  { re: /from\s+["']firebase-admin[^"']*["']/, label: "Firebase Admin SDK (bypasses security rules)" },
];

/** Authentication, or verification of who is calling (signed webhooks, cron secrets). */
const AUTH_CHECK = [
  /\.auth\.(getUser|getSession|getClaims)\s*\(/,
  /\bgetServerSession\s*\(/,
  /\bauth\s*\(\s*\)/, // Auth.js v5, Clerk
  /\b(currentUser|getAuth|getToken|getKindeServerSession|validateRequest|verifyIdToken|jwtVerify)\s*\(/,
  /\bjwt\.verify\s*\(/,
  /\bauth\.protect\s*\(/,
  /\bwith(Auth|Session|User|ApiAuth|Admin|ApiAuthRequired)\w*\s*\(/,
  // requireUser(), getSession(), checkAuth(), getCurrentUser(), assertAdminRole()...
  /\b(require|ensure|assert|check|verify|validate|get)(?:[A-Z]\w*?)?(User|Auth|Session|Admin|Token|Owner|Member|Role)\w*\s*\(/,
  /\bisAuthenticated\b/,
  /headers\.get\(\s*["'](authorization|x-api-key)["']\s*\)|headers\[["'](authorization|x-api-key)["']\]/i,
  // Signed webhooks and cron jobs
  /\b(constructEvent|constructEventAsync|verifyWebhook|verifySignature|timingSafeEqual|createHmac)\s*\(/,
  /new\s+Webhook\s*\(/,
  /CRON_SECRET|stripe-signature|svix-signature|x-hub-signature|x-signature/i,
];

const WRITE = /\.auth\.admin\.(deleteUser|createUser|updateUserById|inviteUserByEmail)\s*\(|\.(insert|update|upsert|delete|rpc)\s*\(|\bprisma\.\w+\.(create|update|delete|upsert)\w*\s*\(|\bdb\.(insert|update|delete)\b|\$executeRaw/;
const DATA_ACCESS = /\.from\(\s*["'`]|\.(insert|update|upsert|delete|rpc|select)\s*\(|\bprisma\.|\bdb\.|\.collection\(|\bsql`|\$queryRaw|\$executeRaw|\.firestore\(\)/;

const IMPORT_RE = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/;
/** All imports in a file, including ones wrapped over several lines (Prettier does this). */
const IMPORT_ALL = /^[ \t]*import\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/gm;

function findRoutes(files: RepoFile[]): Route[] {
  const routes: Route[] = [];
  for (const file of files) {
    if (TEST_FILE.test(file.path)) continue;
    let m: RegExpMatchArray | null;
    if ((m = file.path.match(EDGE_FN))) {
      routes.push({ file, kind: "edge", endpoint: `/functions/v1/${m[1]}`, methods: ["ALL"] });
    } else if ((m = file.path.match(PAGES_API))) {
      routes.push({ file, kind: "pages", endpoint: `/api/${m[1].replace(/\/?index$/, "")}`.replace(/\/$/, ""), methods: ["ALL"] });
    } else if ((m = file.path.match(APP_ROUTE))) {
      const segments = m[1].split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@")); // drop route groups and slots
      const methods = [...file.content.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((x) => x[1]);
      if (methods.length) routes.push({ file, kind: "app", endpoint: `/${segments.join("/")}`, methods: [...new Set(methods)] });
    }
  }
  return routes;
}

/** Resolve a local import ("./x", "../x", "@/x", "~/x") to a file in the snapshot. */
function resolveImport(from: string, spec: string, byPath: Map<string, RepoFile>): RepoFile | undefined {
  let bases: string[];
  if (spec.startsWith(".")) {
    const parts = from.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    bases = [parts.join("/")];
  } else if (/^[@~]\//.test(spec)) {
    const rest = spec.slice(2);
    bases = [`src/${rest}`, rest];
  } else return;
  for (const base of bases) {
    for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"]) {
      const f = byPath.get(base + suffix);
      if (f) return f;
    }
  }
}

const privilegeOf = (text: string) => PRIVILEGED.find((p) => p.re.test(text))?.label;

/** Show a source line in evidence with any secret on it redacted. */
function safeLine(line: string) {
  const { matches } = scanText(line);
  const text = matches.length ? matches[0].context : line;
  return text.trim().slice(0, 160);
}

/** An auth middleware.ts that rejects or redirects requests may protect these routes. */
function authMiddleware(files: RepoFile[]): string | undefined {
  const mw = files.find((f) => /^(src\/)?middleware\.(ts|js)$/.test(f.path));
  if (!mw) return;
  const authed = AUTH_CHECK.some((re) => re.test(mw.content)) || /clerkMiddleware|NextAuth|withAuth|updateSession/.test(mw.content);
  const denies = /NextResponse\.redirect|status:\s*401|\b401\b|auth\.protect|unauthori[sz]ed/i.test(mw.content);
  return authed && denies ? mw.path : undefined;
}

export function analyzeApiAuth(snap: RepoSnapshot): AnalyzerResult {
  const byPath = new Map(snap.files.map((f) => [f.path, f]));
  const routes = findRoutes(snap.files);
  const middleware = authMiddleware(snap.files);
  const findings: RawFinding[] = [];
  let privileged = 0;
  let publicSkipped = 0;

  for (const route of routes) {
    const lines = route.file.content.split("\n");
    // Evidence by line number, so no line is shown twice.
    const evidence = new Map<number, string>();
    let label: string | undefined;
    // Imports first: "this module uses the service-role key" is more precise than a variable name.
    for (const m of route.file.content.matchAll(IMPORT_ALL)) {
      const mod = resolveImport(route.file.path, m[1], byPath);
      const modLabel = mod && privilegeOf(mod.content);
      if (!modLabel) continue;
      label ??= modLabel;
      const line = route.file.content.slice(0, m.index).split("\n").length; // where the import starts
      evidence.set(line, `${safeLine(m[0].replace(/\s+/g, " "))}   ← ${mod.path} uses ${modLabel}`);
    }
    // Then privileged access written in the route itself.
    lines.forEach((l, i) => {
      const own = privilegeOf(l);
      if (own && !evidence.has(i + 1)) {
        label ??= own;
        evidence.set(i + 1, `${safeLine(l)}   ← ${own}`);
      }
    });
    if (!label) continue;
    privileged++;
    if (PUBLIC_ENDPOINT.test(route.endpoint)) {
      publicSkipped++;
      continue;
    }
    if (AUTH_CHECK.some((re) => re.test(route.file.content))) continue;

    lines.forEach((l, i) => {
      if (DATA_ACCESS.test(l) && !IMPORT_RE.test(l) && !evidence.has(i + 1)) evidence.set(i + 1, safeLine(l));
    });
    const shown = [...evidence.entries()].sort((a, b) => a[0] - b[0]).slice(0, 8);
    const writes = WRITE.test(route.file.content);
    const firstLine = shown[0]?.[0];
    const methods = route.methods.join(", ");
    findings.push({
      ruleId: "unprotected-api-route",
      severity: middleware ? "medium" : "high",
      fingerprint: `${ID}:${route.file.path}`,
      location: `${route.file.path}${firstLine ? `:${firstLine}` : ""} → ${methods} ${route.endpoint}`,
      evidence: [
        `// ${route.endpoint} (${route.kind === "edge" ? "Supabase Edge Function" : route.kind === "pages" ? "pages/api handler" : `exports ${methods}`})`,
        `// ${writes ? "Reads and writes" : "Reads"} data with ${label}, and no authentication check was found.`,
        ...shown.map(([n, text]) => `L${n}: ${text}`),
        `// Looked for: supabase.auth.getUser(), getServerSession(), auth(), jwt.verify(), requireUser()-style helpers, withAuth(...) wrappers, webhook signature checks.`,
        ...(middleware ? [`// Note: ${middleware} contains an authentication check. If it covers this route, this may be a false positive.`] : []),
      ].join("\n"),
      evidenceLang: "ts",
    });
  }

  const scope =
    routes.length === 0
      ? "No API routes found (looked for app/**/route.ts, pages/api/** and supabase/functions/*)"
      : `${routes.length} API route${routes.length === 1 ? "" : "s"}, ${privileged} with admin database access` +
        (publicSkipped ? ` (${publicSkipped} public by design, e.g. auth callbacks, not flagged)` : "");
  return { check: ID, covered: [ID], findings, scope };
}
