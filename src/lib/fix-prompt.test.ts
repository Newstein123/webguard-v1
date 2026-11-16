import { describe, expect, it } from "vitest";
import { buildFixPrompt, sanitizeForPrompt } from "./fix-prompt";
import { RULES_BY_ID } from "./rules";
import { finding, secretFinding } from "./__tests__/fixtures";

const project = { name: "Promptopia", stack: ["Next.js", "Supabase"] };

describe("sanitizeForPrompt", () => {
  it("removes the scanner's partial redactions, keeping no key prefix", () => {
    const out = sanitizeForPrompt(secretFinding.evidence);
    expect(out).not.toContain("sk_live_51");
    expect(out).toContain("[REDACTED]");
    // Only the secret is replaced; surrounding code stays readable.
    expect(out).toContain('const stripe = new Stripe("[REDACTED]");');
    expect(out).toContain("// Stripe live secret key ([REDACTED])");
  });

  it("strips unredacted secrets of every known format", () => {
    const raw = [
      "sk_live_" + "a".repeat(24),
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "ghp_" + "b".repeat(36),
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl",
      "sb_secret_" + "c".repeat(24),
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
      "DATABASE_PASSWORD=hunter2hunter2",
    ].join("\n");
    const out = sanitizeForPrompt(raw);
    for (const leaked of ["aaaaaaaa", "ABCDEFGHIJKLMNOP", "bbbbbbbb", "c2lnbmF0dXJl", "cccccccc", "MIIEvQ", "hunter2"]) {
      expect(out).not.toContain(leaked);
    }
  });

  it("keeps env var references and already-redacted .env evidence intact", () => {
    expect(sanitizeForPrompt("const apiKey = process.env.OPENAI_API_KEY;")).toBe("const apiKey = process.env.OPENAI_API_KEY;");
    expect(sanitizeForPrompt("STRIPE_SECRET_KEY=<redacted>")).toBe("STRIPE_SECRET_KEY=<redacted>");
  });
});

describe("buildFixPrompt", () => {
  const rule = RULES_BY_ID["supabase-rls-permissive"];

  it("Normal Mode: plain-language, contextual, with testing and preservation instructions", () => {
    const p = buildFixPrompt({ finding: finding(), rule, mode: "normal", project });
    expect(p).toContain(rule.title);
    expect(p).toContain(rule.ai.goal);
    expect(p).toContain("public.profiles"); // where, from the scanner location
    expect(p).toContain("Next.js, Supabase");
    expect(p).toMatch(/Keep everything else in my app working/);
    expect(p).toMatch(/How to check it worked/);
    for (const t of rule.ai.tests.simple) expect(p).toContain(t);
    // No technical scaffolding in Normal Mode.
    expect(p).not.toContain("CWE-");
    expect(p).not.toContain("Rule: ");
    expect(p).not.toContain("`");
  });

  it("Developer Mode: rule id, resources, evidence, expected behaviour, constraints and tests", () => {
    const p = buildFixPrompt({ finding: finding(), rule, mode: "developer", project });
    expect(p).toContain("Rule: supabase-rls-permissive");
    expect(p).toContain(rule.technicalTitle);
    expect(p).toContain("Severity: critical");
    expect(p).toContain("Table: public.profiles");
    expect(p).toContain('Policy: Enable read access for all users');
    expect(p).toContain("File: supabase/migrations/001_init.sql");
    expect(p).toContain("using (true)"); // evidence
    expect(p).toContain("CWE-863");
    for (const e of rule.ai.expected) expect(p).toContain(e);
    for (const t of rule.ai.tests.technical) expect(p).toContain(t);
    expect(p).toMatch(/## Constraints/);
  });

  it("never includes credential material in either mode", () => {
    const rule = RULES_BY_ID["hardcoded-secret"];
    for (const mode of ["normal", "developer"] as const) {
      const p = buildFixPrompt({ finding: secretFinding, rule, mode, project });
      expect(p).not.toContain("sk_live_51");
      expect(p).toMatch(/rotate/i); // the human-only step is surfaced
    }
  });

  it("references advisories present in dependency evidence, and only those", () => {
    const dep = finding({
      ruleId: "vulnerable-dependency",
      analyzer: "deps",
      severity: "high",
      location: "package-lock.json → axios@1.6.0",
      evidence:
        "package:   axios@1.6.0\nfix:       upgrade to axios@1.8.2 or later\nadvisories (1):\nGHSA-jr5f-v2jv-69x6 (CVE-2025-27152)  HIGH\n  axios SSRF and credential leakage",
      evidenceLang: "text",
    });
    const p = buildFixPrompt({ finding: dep, rule: RULES_BY_ID["vulnerable-dependency"], mode: "developer" });
    expect(p).toContain("CVE-2025-27152");
    expect(p).toContain("GHSA-jr5f-v2jv-69x6");
    expect(p).toContain("Package: axios");
    expect(p).toContain("Version: 1.6.0");
    const noAdvisories = buildFixPrompt({ finding: finding(), rule, mode: "developer" });
    expect(noAdvisories).not.toMatch(/CVE-\d/);
  });

  it("produces a prompt for every rule in both modes", () => {
    for (const r of Object.values(RULES_BY_ID)) {
      for (const mode of ["normal", "developer"] as const) {
        const p = buildFixPrompt({ finding: finding({ ruleId: r.id }), rule: r, mode });
        expect(p.length).toBeGreaterThan(200);
        expect(p).not.toContain("undefined");
      }
    }
  });
});
