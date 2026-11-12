import "server-only";
import type { Severity } from "@/lib/types";
import type { AnalyzerResult, RawFinding, RepoSnapshot } from "../types";

/** npm dependency advisories via the public OSV database (osv.dev). */
export const ID = "deps";

const OSV = "https://api.osv.dev/v1";
const MAX_VULN_DETAILS = 150;

interface Pkg {
  name: string;
  version: string;
  dev: boolean;
  lockfile: string;
}

interface OsvVuln {
  id: string;
  summary?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { events: Record<string, string>[] }[] }[];
}

/** Parse package-lock.json v1/v2/v3 into a unique list of installed packages. */
export function parsePackageLock(content: string, lockfile: string): Pkg[] {
  let json: { packages?: Record<string, { version?: string; dev?: boolean; link?: boolean }>; dependencies?: Record<string, unknown> };
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const out = new Map<string, Pkg>();
  if (json.packages) {
    for (const [key, info] of Object.entries(json.packages)) {
      if (!key || info.link || !info.version) continue;
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      out.set(`${name}@${info.version}`, { name, version: info.version, dev: !!info.dev, lockfile });
    }
  } else if (json.dependencies) {
    const walk = (deps: Record<string, unknown>) => {
      for (const [name, raw] of Object.entries(deps)) {
        const d = raw as { version?: string; dev?: boolean; dependencies?: Record<string, unknown> };
        if (d.version && /^\d/.test(d.version)) out.set(`${name}@${d.version}`, { name, version: d.version, dev: !!d.dev, lockfile });
        if (d.dependencies) walk(d.dependencies);
      }
    };
    walk(json.dependencies);
  }
  return [...out.values()];
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

async function osvPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OSV}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OSV API error (${res.status})`);
  return res.json() as Promise<T>;
}

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

export async function analyzeDependencies(snap: RepoSnapshot): Promise<AnalyzerResult & { notes: string[] }> {
  const notes: string[] = [];
  const lockfiles = snap.files.filter((f) => /(^|\/)package-lock\.json$/.test(f.path));
  if (lockfiles.length === 0) {
    const other = snap.allPaths.find((p) => /(^|\/)(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(p));
    notes.push(other ? `Only package-lock.json is supported right now (found ${other}).` : "No package-lock.json found.");
    // Without a lockfile we cannot tell, so do not resolve existing dependency findings.
    return { covered: [], findings: [], notes };
  }

  const pkgs = lockfiles.flatMap((f) => parsePackageLock(f.content, f.path));
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
  await mapLimit(ids, 8, async (id) => {
    const res = await fetch(`${OSV}/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) details.set(id, (await res.json()) as OsvVuln);
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
  return { covered: [ID], findings, notes };
}
