import { describe, expect, it } from "vitest";
import { advisoryRefs, affectedResources, analyzerInfo } from "./finding-details";
import { toFinding, type FindingRow } from "./db";
import { RULES } from "./rules";

const res = (analyzer: string, location: string) => affectedResources({ analyzer, location });

describe("affectedResources", () => {
  it("parses every location format the analyzers write", () => {
    expect(res("repo-secrets", "src/lib/stripe.ts:42")).toEqual([
      { label: "File", value: "src/lib/stripe.ts" },
      { label: "Line", value: "42" },
    ]);
    expect(res("repo-secrets", ".env.production")).toEqual([{ label: "File", value: ".env.production" }]);
    expect(res("deps", "package-lock.json → @supabase/auth-js@2.1.0 (dev)")).toEqual([
      { label: "Package", value: "@supabase/auth-js (dev dependency)" },
      { label: "Version", value: "2.1.0" },
      { label: "Lockfile", value: "package-lock.json" },
    ]);
    expect(res("rls", "supabase/migrations/01.sql → public.todos")).toEqual([
      { label: "Table", value: "public.todos" },
      { label: "File", value: "supabase/migrations/01.sql" },
    ]);
    expect(res("rls", 'supabase/migrations/01.sql → policy "anyone → read" on public.todos')[1]).toEqual({ label: "Policy", value: "anyone → read" });
    expect(res("site-bundle", "https://app.example.com/assets/index-abc.js")).toEqual([{ label: "URL", value: "https://app.example.com/assets/index-abc.js" }]);
  });

  it("falls back to the raw location instead of guessing", () => {
    expect(res("unknown", "somewhere")).toEqual([{ label: "Location", value: "somewhere" }]);
    expect(res("repo-secrets", "")).toEqual([{ label: "File", value: "" }]);
  });
});

describe("advisoryRefs", () => {
  it("returns only identifiers present in the evidence", () => {
    expect(advisoryRefs("GHSA-jr5f-v2jv-69x6 (CVE-2025-27152)  HIGH").map((a) => a.id).sort()).toEqual(["CVE-2025-27152", "GHSA-jr5f-v2jv-69x6"]);
    expect(advisoryRefs("no advisories here")).toEqual([]);
  });
});

describe("analyzerInfo / toFinding", () => {
  it("derives the analyzer from the fingerprint prefix without exposing the fingerprint", () => {
    const f = toFinding({ fingerprint: "repo-secrets:abc123:src/a.ts", last_seen_scan_id: "s9" } as FindingRow);
    expect(f.analyzer).toBe("repo-secrets");
    expect(f.lastSeenScanId).toBe("s9");
    expect(JSON.stringify(f)).not.toContain("abc123");
    expect(analyzerInfo("repo-secrets").name).toBe("Repository secret scan");
  });
});

describe("rule knowledge base", () => {
  it("has complete Normal and Developer Mode content for every rule", () => {
    for (const r of RULES) {
      for (const k of ["title", "technicalTitle", "simple", "technical", "whyItMatters", "impact", "rootCause", "attackScenario"] as const) {
        expect(r[k], `${r.id}.${k}`).toBeTruthy();
      }
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      expect(r.remediation.length, r.id).toBeGreaterThan(0);
      expect(r.cwe.length, r.id).toBeGreaterThan(0);
      for (const c of r.cwe) expect(c.id).toMatch(/^CWE-\d+$/);
      expect(r.ai.goal, r.id).toBeTruthy();
      expect(r.ai.expected.length && r.ai.tests.simple.length && r.ai.tests.technical.length, r.id).toBeTruthy();
    }
  });
});
