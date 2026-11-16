import type { Finding, Scan } from "../types";

/** Findings shaped exactly as the analyzers write them (see src/server/scanner/analyzers). */
export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    projectId: "p1",
    ruleId: "supabase-rls-permissive",
    severity: "critical",
    location: 'supabase/migrations/001_init.sql → policy "Enable read access for all users" on public.profiles',
    evidence: '-- Lets anyone (anon) read every row in public.profiles\ncreate policy "Enable read access for all users" on public.profiles\n  for select\n  using (true);',
    evidenceLang: "sql",
    status: "open",
    firstSeenScanId: "s1",
    lastSeenScanId: "s1",
    analyzer: "rls",
    ...overrides,
  };
}

export function scan(id: string, startedAt: string, overrides: Partial<Scan> = {}): Scan {
  return {
    id,
    projectId: "p1",
    trigger: "manual",
    status: "completed",
    stages: [],
    stageIndex: 0,
    startedAt,
    durationSec: 1,
    openFindingIds: [],
    resolvedFindingIds: [],
    newFindingIds: [],
    ...overrides,
  };
}

/** A finding whose stored evidence is the scanner's redacted form of a Stripe key. */
export const secretFinding = finding({
  id: "f-secret",
  ruleId: "hardcoded-secret",
  severity: "critical",
  analyzer: "repo-secrets",
  location: "src/lib/payments.ts:12",
  evidence: '// Stripe live secret key (sk_live_51…[redacted 107 chars])\nconst stripe = new Stripe("sk_live_51…[redacted 107 chars]");',
  evidenceLang: "ts",
});
