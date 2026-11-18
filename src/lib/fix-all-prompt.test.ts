import { describe, expect, it } from "vitest";
import { buildFixAllPrompt, groupOpenFindings } from "./fix-prompt";
import { RULES_BY_ID } from "./rules";
import { finding, secretFinding } from "./__tests__/fixtures";
import type { Finding } from "./types";

const dep = (name: string, id: string, severity: Finding["severity"] = "high"): Finding =>
  finding({
    id,
    ruleId: "vulnerable-dependency",
    analyzer: "deps",
    severity,
    location: `package-lock.json → ${name}@1.0.0`,
    evidence: `package:   ${name}@1.0.0\nfix:       upgrade to ${name}@1.0.1 or later\nadvisories (1):\nGHSA-aaaa-bbbb-cccc (CVE-2025-0001)  HIGH\n  bug`,
    evidenceLang: "text",
  });
const headers = finding({ id: "h", ruleId: "missing-security-headers", analyzer: "site-headers", severity: "medium", location: "https://app.test/", evidence: "✗ missing  Content-Security-Policy", evidenceLang: "http" });
const rls = finding({ id: "r" }); // critical, supabase-rls-permissive
const all = [headers, dep("axios", "d1"), dep("lodash", "d2", "medium"), dep("next", "d3", "critical"), rls];
const build = (findings: Finding[], mode: "normal" | "developer") =>
  buildFixAllPrompt({ findings, rulesById: RULES_BY_ID, mode, project: { name: "App", stack: ["Next.js", "Supabase"] } });
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("groupOpenFindings", () => {
  it("groups by issue type, most severe group first, then larger groups", () => {
    const g = groupOpenFindings(all, RULES_BY_ID);
    expect(g.map((x) => x.rule.id)).toEqual(["vulnerable-dependency", "supabase-rls-permissive", "missing-security-headers"]);
    expect(g[0].findings.map((f) => f.id)).toEqual(["d3", "d1", "d2"]); // critical, high, medium
  });

  it("includes only open findings", () => {
    const g = groupOpenFindings([rls, { ...headers, status: "ignored" }, { ...dep("x", "dx"), status: "resolved" }], RULES_BY_ID);
    expect(g.flatMap((x) => x.findings.map((f) => f.id))).toEqual(["r"]);
  });
});

describe("buildFixAllPrompt", () => {
  it("Normal Mode: one plain-language prompt covering every open issue in order", () => {
    const p = build(all, "normal");
    expect(p).toMatch(/^A security scanner \(WebGuard\) found 5 problems in my app \(built with Next\.js, Supabase\), grouped into 3 types/);
    const order = [RULES_BY_ID["vulnerable-dependency"].title, RULES_BY_ID["supabase-rls-permissive"].title, RULES_BY_ID["missing-security-headers"].title].map((t) => p.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p).toContain("(critical, 3 places)");
    // Each dependency location carries its patched version from the evidence.
    expect(p).toContain("package-lock.json → axios@1.0.0 (upgrade to axios@1.0.1 or later)");
    expect(p).toContain("Fix the issues one at a time");
    expect(count(p, "WebGuard re-scan")).toBe(1); // one closing reminder, not one per rule
    expect(p).not.toMatch(/CWE-|Rule: |```/);
  });

  it("states shared rules once and merges manual steps and checks", () => {
    const twoSecrets = [secretFinding, { ...secretFinding, id: "s2", location: "src/other.ts:3" }, rls];
    const p = build(twoSecrets, "normal");
    expect(count(p, "Never write passwords, API keys or tokens")).toBe(1);
    expect(count(p, RULES_BY_ID["hardcoded-secret"].ai.manual![0])).toBe(1);
    expect(count(p, RULES_BY_ID["hardcoded-secret"].ai.tests.simple[0])).toBe(1);
    expect(p).toContain("src/lib/payments.ts:12");
    expect(p).toContain("src/other.ts:3");
  });

  it("Developer Mode: rule ids, references, evidence capped per group with a note", () => {
    const fourDeps = [dep("a", "1"), dep("b", "2"), dep("c", "3"), dep("d", "4")];
    const p = build([...fourDeps, rls], "developer");
    expect(p).toContain("Rule: vulnerable-dependency");
    expect(p).toContain("Rule: supabase-rls-permissive");
    expect(p).toContain("CVE-2025-0001");
    expect(p).toContain("CWE-1395");
    expect(count(p, "```text")).toBe(3);
    expect(p).toContain("Evidence shown for 3 of 4; the same pattern applies to every location listed above.");
    for (const n of ["a", "b", "c", "d"]) expect(p).toContain(`package-lock.json → ${n}@1.0.0`);
    expect(p).toContain(RULES_BY_ID["supabase-rls-permissive"].ai.tests.technical[0]);
  });

  it("never includes credential material in either mode", () => {
    for (const mode of ["normal", "developer"] as const) {
      const p = build([secretFinding, rls], mode);
      expect(p).not.toContain("sk_live_51");
      expect(p.length).toBeGreaterThan(500);
    }
  });

  it("is empty when there is nothing open to fix", () => {
    expect(build([{ ...rls, status: "ignored" }], "normal")).toBe("");
    expect(build([], "developer")).toBe("");
  });
});
