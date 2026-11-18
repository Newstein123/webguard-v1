/**
 * What WebGuard checks, mapped onto the 10 security areas, and what a given
 * scan actually covered.
 *
 * CHECKS mirrors the analyzers in src/server/scanner/analyzers. A category
 * with no check is "not checked yet". Never add a placeholder check to fill
 * a category: the dashboard must only claim what an analyzer really ran.
 */
import { CATEGORIES, type Category } from "./types";

export const CATEGORY_DESCRIPTION: Record<Category, string> = {
  "Code Security": "Injection, XSS, insecure code",
  "Authentication & Authorization": "Login, sessions, access control",
  "API Security": "Endpoint protection and data exposure",
  "Database Security": "RLS, permissions, database access",
  "Secrets & Data Protection": "Credentials, sensitive data, encryption",
  "Dependency Security": "Vulnerable packages and supply chain",
  "Frontend Security": "Browser security and security headers",
  "Infrastructure Security": "Cloud, containers, deployment",
  "File & Input Security": "Uploads, validation, unsafe input",
  "Runtime & Business Logic": "Abuse, workflows, runtime vulnerabilities",
};

export type CheckId = "repo-secrets" | "deps" | "rls" | "api-auth" | "site-headers" | "site-bundle";

export interface CheckDef {
  id: CheckId;
  name: string;
  category: Category;
  /** Where the check gets its input. */
  source: "repo" | "site";
  /** Plain-language scope, including its main limit. */
  covers: string;
  /** How it detects issues (Developer Mode). */
  method: string;
}

export const CHECKS: CheckDef[] = [
  {
    id: "repo-secrets",
    name: "Repository secret scan",
    category: "Secrets & Data Protection",
    source: "repo",
    covers: "Known API key formats and committed .env files in your source code",
    method: "Static pattern match of tracked repository files against known credential formats, plus detection of committed .env files.",
  },
  {
    id: "site-bundle",
    name: "Live JavaScript bundle scan",
    category: "Secrets & Data Protection",
    source: "site",
    covers: "Known API key formats in the JavaScript your homepage loads",
    method: "Passive HTTP GET of the page and its same-origin scripts; content matched against known credential formats.",
  },
  {
    id: "rls",
    name: "Supabase RLS analysis",
    category: "Database Security",
    source: "repo",
    covers: "Row Level Security in supabase/migrations (changes made only in the Supabase dashboard are not visible)",
    method: "Static replay of supabase/migrations/*.sql in order; the final table and policy state is evaluated.",
  },
  {
    id: "deps",
    name: "Dependency audit",
    category: "Dependency Security",
    source: "repo",
    covers: "npm packages in package-lock.json, pnpm-lock.yaml, yarn.lock or bun.lock, checked against the OSV advisory database",
    method: "Lockfile package versions (npm, pnpm, yarn, bun) matched against the OSV advisory database.",
  },
  {
    id: "api-auth",
    name: "API route auth check",
    category: "API Security",
    source: "repo",
    covers:
      "Next.js route handlers, pages/api routes and Supabase Edge Functions that use admin database access without checking who is calling (Express and other servers not yet)",
    method:
      "Static analysis: routes using a privileged data client (service-role key, admin client, Prisma, Drizzle, raw drivers, Firebase Admin), directly or via a local import, with no authentication or signature check in the handler.",
  },
  {
    id: "site-headers",
    name: "Live site headers",
    category: "Frontend Security",
    source: "site",
    covers: "Security headers and HTTPS on your homepage",
    method: "Passive HTTP GET of the deployed page; response headers and final URL scheme inspected.",
  },
];

export const CHECKS_BY_ID = Object.fromEntries(CHECKS.map((c) => [c.id, c])) as Record<CheckId, CheckDef>;

/** What one check did in one scan. Stored on the scan row (scans.coverage). */
export type CheckCoverage =
  | { check: CheckId; status: "ran"; scope: string }
  | { check: CheckId; status: "skipped"; reason: string };

/**
 * checked       every check for the area ran
 * partial       some ran, some were skipped this scan
 * skipped       the area has checks but none ran this scan
 * not_available WebGuard has no check for this area yet
 * unknown       the scan predates coverage recording
 */
export type CategoryStatus = "checked" | "partial" | "skipped" | "not_available" | "unknown";

export interface CategoryCoverage {
  category: Category;
  description: string;
  status: CategoryStatus;
  checks: { def: CheckDef; result?: CheckCoverage }[];
}

export function categoryCoverage(coverage: CheckCoverage[] | null | undefined): CategoryCoverage[] {
  const byCheck = new Map((coverage ?? []).map((c) => [c.check, c]));
  return CATEGORIES.map((category) => {
    const checks = CHECKS.filter((c) => c.category === category).map((def) => ({ def, result: byCheck.get(def.id) }));
    let status: CategoryStatus;
    if (checks.length === 0) status = "not_available";
    else if (!coverage) status = "unknown";
    else {
      const ran = checks.filter((c) => c.result?.status === "ran").length;
      status = ran === checks.length ? "checked" : ran > 0 ? "partial" : "skipped";
    }
    return { category, description: CATEGORY_DESCRIPTION[category], status, checks };
  });
}

/** Areas where at least one check ran. */
export function checkedAreaCount(coverage: CheckCoverage[] | null | undefined): number {
  return categoryCoverage(coverage).filter((c) => c.status === "checked" || c.status === "partial").length;
}
