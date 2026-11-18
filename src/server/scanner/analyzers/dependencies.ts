import "server-only";
import type { Severity } from "@/lib/types";
import type { AnalyzerResult, RawFinding, RepoSnapshot } from "../types";
import { LOCKFILE_RE, parseLockfile, type Pkg } from "../lockfiles";

/** Kept for existing callers and tests. */
export { parsePackageLock } from "../lockfiles";

/** npm-ecosystem dependency advisories (npm, pnpm, yarn, bun lockfiles) via the public OSV database (osv.dev). */
export const ID = "deps";

const OSV = "https://api.osv.dev/v1";
const MAX_VULN_DETAILS = 150;


interface OsvVuln {
  id: string;
  summary?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { events: Record<string, string>[] }[] }[];
}

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const DOWNGRADE: Record<Severity, Severity> = { critical: "high", high: "medium", medium: "low", low: "low", info: "info" };

function osvSeverity(v: OsvVuln): Severity {
  switch (v.database_specific?.severity?.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

function fixedVersion(v: OsvVuln, pkg: string): string | undefined {
  for (const a of v.affected ?? []) {
    if (a.package?.name !== pkg) continue;
    for (const r of a.ranges ?? []) for (const e of r.events) if (e.fixed) return e.fixed;
  }
}

/** OSV could not be reached or answered with an error, after retries. */
export class OsvUnavailableError extends Error {}

/** Backoff between attempts; exported so tests can shorten it. */
export const osvRetry = { delaysMs: [500, 1500] };

/**
 * GET/POST against OSV with retries for transient failures (network errors,
 * timeouts, 429, 5xx). Any other non-OK status fails immediately.
 */
async function osvFetch<T>(path: string, init: RequestInit & { timeoutMs: number }): Promise<T> {
  let reason = "";
  for (let attempt = 0; attempt <= osvRetry.delaysMs.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, osvRetry.delaysMs[attempt - 1]));
    try {
      const res = await fetch(`${OSV}${path}`, { ...init, signal: AbortSignal.timeout(init.timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      reason = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      reason = cause ?? (e instanceof Error ? e.message : String(e));
    }
  }
  throw new OsvUnavailableError(reason);
}

const osvPost = <T>(path: string, body: unknown) =>
  osvFetch<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 30_000 });

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function analyzeDependencies(snap: RepoSnapshot): Promise<AnalyzerResult> {
  const lockfiles = snap.files.filter((f) => LOCKFILE_RE.test(f.path));
  const skip = (reason: string): AnalyzerResult => ({ check: ID, covered: [], findings: [], skipped: reason });
  // Without a readable lockfile we cannot tell, so existing dependency findings are left unchanged.
  if (lockfiles.length === 0) {
    const binaryBun = snap.allPaths.find((p) => /(^|\/)bun\.lockb$/.test(p));
    if (binaryBun)
      return skip(
        `${binaryBun} is Bun's binary lockfile, which can't be read. Bun 1.2+ writes a text bun.lock instead: run \`bun install --save-text-lockfile\`, commit bun.lock, and scan again.`,
      );
    const tooBig = snap.allPaths.find((p) => LOCKFILE_RE.test(p));
    if (tooBig) return skip(`${tooBig} couldn't be read (it may be larger than the 20 MB limit).`);
    return skip("No lockfile found (looked for package-lock.json, pnpm-lock.yaml, yarn.lock and bun.lock).");
  }

  const pkgs: Pkg[] = [];
  for (const f of lockfiles) {
    const parsed = parseLockfile(f.path, f.content);
    // Never audit partial data: packages missing from the parse would look fixed.
    if (parsed.length === 0) return skip(`${f.path} couldn't be parsed, so dependencies weren't checked.`);
    pkgs.push(...parsed);
  }
  // The same package can appear in several lockfiles (monorepos); query OSV once per version.
  const unique = [...new Map(pkgs.map((p) => [`${p.name}@${p.version}`, p])).values()];

  try {
    return await auditPackages(unique, lockfiles.map((f) => f.path).join(", "));
  } catch (e) {
    if (!(e instanceof OsvUnavailableError)) throw e;
    // Never claim coverage on partial data: that would mark open dependency findings as resolved.
    return {
      check: ID,
      covered: [],
      findings: [],
      failed: true,
      skipped: `Couldn't reach the OSV advisory database (${e.message}). Existing dependency findings were left unchanged. Run the scan again.`,
    };
  }
}

async function auditPackages(pkgs: Pkg[], files: string): Promise<AnalyzerResult> {
  const results: { vulns?: { id: string }[] }[] = [];
  for (let i = 0; i < pkgs.length; i += 1000) {
    const batch = pkgs.slice(i, i + 1000);
    const r = await osvPost<{ results: { vulns?: { id: string }[] }[] }>("/querybatch", {
      queries: batch.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })),
    });
    results.push(...r.results);
  }

  const ids = [...new Set(results.flatMap((r) => r.vulns?.map((v) => v.id) ?? []))].slice(0, MAX_VULN_DETAILS);
  const details = new Map<string, OsvVuln>();
  // Every advisory must load: a silently missing one would hide a vulnerable package.
  await mapLimit(ids, 8, async (id) => {
    details.set(id, await osvFetch<OsvVuln>(`/vulns/${encodeURIComponent(id)}`, { timeoutMs: 15_000 }));
  });

  // One finding per package name; severity is the worst advisory.
  const byName = new Map<string, { pkg: Pkg; vulns: OsvVuln[] }>();
  pkgs.forEach((pkg, i) => {
    const vulns = (results[i]?.vulns ?? []).map((v) => details.get(v.id)).filter((v): v is OsvVuln => !!v);
    if (!vulns.length) return;
    const cur = byName.get(pkg.name);
    if (cur) cur.vulns.push(...vulns.filter((v) => !cur.vulns.some((x) => x.id === v.id)));
    else byName.set(pkg.name, { pkg, vulns });
  });

  const findings: RawFinding[] = [];
  for (const [name, { pkg, vulns }] of byName) {
    let sev = vulns.map(osvSeverity).reduce<Severity>((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a), "low");
    if (pkg.dev) sev = DOWNGRADE[sev];
    const fixes = vulns.map((v) => fixedVersion(v, name)).filter(Boolean) as string[];
    const target = fixes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
    const lines = vulns
      .sort((a, b) => SEV_RANK[osvSeverity(b)] - SEV_RANK[osvSeverity(a)])
      .slice(0, 8)
      .map((v) => {
        const alias = v.aliases?.find((a) => a.startsWith("CVE-"));
        return `${v.id}${alias ? ` (${alias})` : ""}  ${osvSeverity(v).toUpperCase()}\n  ${(v.summary ?? "No summary").slice(0, 120)}`;
      });
    findings.push({
      ruleId: "vulnerable-dependency",
      severity: sev,
      fingerprint: `${ID}:${name}`,
      location: `${pkg.lockfile} → ${name}@${pkg.version}${pkg.dev ? " (dev)" : ""}`,
      evidence: [
        `package:   ${name}@${pkg.version}${pkg.dev ? "  (dev dependency)" : ""}`,
        `fix:       ${target ? `upgrade to ${name}@${target} or later` : "no patched version published yet"}`,
        `advisories (${vulns.length}):`,
        ...lines,
      ].join("\n"),
      evidenceLang: "text",
    });
  }
  return { check: ID, covered: [ID], findings, scope: `${pkgs.length} package${pkgs.length === 1 ? "" : "s"} in ${files}` };
}
