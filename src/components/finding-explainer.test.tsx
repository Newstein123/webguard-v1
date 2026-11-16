import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceCard, FindingExplanation, VerificationBadge } from "./finding-explainer";
import { RULES_BY_ID } from "@/lib/rules";
import { finding, secretFinding } from "@/lib/__tests__/fixtures";

const rule = RULES_BY_ID["supabase-rls-permissive"];
const project = { name: "Promptopia", stack: ["Supabase"] };
const render = (mode: "normal" | "developer", f = finding(), r = rule) =>
  renderToStaticMarkup(<FindingExplanation finding={f} rule={r} mode={mode} project={project} />);
/** Visible text, so assertions are not fooled by attributes. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("FindingExplanation", () => {
  it("Normal Mode answers the four plain-language questions and offers AI instructions", () => {
    const t = text(render("normal"));
    for (const h of ["What happened?", "Why does it matter?", "What could happen to my app?", "What should I do?", "AI Fix Assistant", "Copy Instructions"]) {
      expect(t).toContain(h);
    }
    expect(t).toContain(rule.impact);
  });

  it("Normal Mode hides technical detail", () => {
    const t = text(render("normal"));
    expect(t).not.toContain("CWE-");
    expect(t).not.toContain("Rule ID");
    expect(t).not.toContain(rule.rootCause.slice(0, 40));
    expect(t).not.toContain("Attack scenario");
  });

  it("Developer Mode shows rule id, classification, scanner-derived resources and root cause", () => {
    const t = text(render("developer"));
    for (const s of ["Technical details", "Rule ID", "supabase-rls-permissive", rule.technicalTitle, "CWE-863", "Supabase RLS analysis", "public.profiles", "Enable read access for all users", "supabase/migrations/001_init.sql", "Root cause", "Attack scenario", "Remediation", "Copy Instructions"]) {
      expect(t).toContain(s);
    }
    // Confidence is not reported by the scanner, so it is not shown.
    expect(t).not.toMatch(/confidence/i);
  });

  it("keeps the same card structure in both modes", () => {
    const sections = (html: string) => (html.match(/class="rounded-xl border bg-surface/g) ?? []).length;
    expect(sections(render("normal"))).toBe(sections(render("developer")));
  });

  it("does not show advisories that are not in the evidence", () => {
    expect(text(render("developer"))).not.toContain("Advisories");
  });

  it("never renders secret prefixes inside the AI instructions", () => {
    for (const mode of ["normal", "developer"] as const) {
      const html = render(mode, secretFinding, RULES_BY_ID["hardcoded-secret"]);
      const prompt = html.match(/<pre[^>]*aria-label="AI fix instructions"[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? "";
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).not.toContain("sk_live_51");
    }
  });
});

describe("EvidenceCard", () => {
  it("collapses evidence in Normal Mode and shows it with the analyzer in Developer Mode", () => {
    const normal = renderToStaticMarkup(<EvidenceCard finding={finding()} mode="normal" />);
    expect(normal).toContain("<details");
    expect(normal).toContain("Show the technical evidence");
    const dev = renderToStaticMarkup(<EvidenceCard finding={finding()} mode="developer" />);
    expect(dev).not.toContain("<details");
    expect(dev).toContain("Recorded by Supabase RLS analysis");
  });
});

describe("VerificationBadge", () => {
  it("labels each verification state", () => {
    const label = (kind: Parameters<typeof VerificationBadge>[0]["state"]) => text(renderToStaticMarkup(<VerificationBadge state={kind} />)).trim();
    expect(label({ kind: "resolved", scanId: "s" })).toBe("Verified fixed");
    expect(label({ kind: "still_present", scanId: "s" })).toBe("Still detected");
    expect(label({ kind: "regressed", scanId: "s" })).toBe("Regressed");
    expect(label({ kind: "manual_review", scanId: "s", reason: "scan_failed" })).toBe("Needs review");
  });
});
