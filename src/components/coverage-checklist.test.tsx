import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageChecklist } from "./coverage-checklist";
import type { CheckCoverage } from "@/lib/coverage";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const cov: CheckCoverage[] = [
  { check: "repo-secrets", status: "ran", scope: "120 files in o/r@main" },
  { check: "site-bundle", status: "skipped", reason: "Your live site couldn't be checked: timeout" },
  { check: "rls", status: "ran", scope: "4 migration files, 6 public tables" },
  { check: "deps", status: "skipped", reason: "Only npm's package-lock.json is supported so far (found bun.lockb)." },
  { check: "site-headers", status: "skipped", reason: "Your live site couldn't be checked: timeout" },
];

describe("CoverageChecklist", () => {
  it("shows what ran, what was skipped and why, and what isn't checked yet", () => {
    const t = text(renderToStaticMarkup(<CoverageChecklist coverage={cov} />));
    expect(t).toContain("Database Security Checked");
    expect(t).toContain("4 migration files, 6 public tables");
    expect(t).toContain("Secrets & Data Protection Partly checked");
    expect(t).toContain("Dependency Security Skipped this scan");
    expect(t).toContain("(found bun.lockb)");
    expect(t).toContain("Not checked yet");
    for (const area of ["Code Security", "Authentication & Authorization", "API Security", "Infrastructure Security", "File & Input Security", "Runtime & Business Logic"]) {
      expect(t).toContain(area);
    }
  });

  it("never shows a percentage or overall grade", () => {
    expect(renderToStaticMarkup(<CoverageChecklist coverage={cov} />)).not.toMatch(/\d+\s*%|of 10/);
  });

  it("says coverage is unknown for old scans instead of guessing", () => {
    const t = text(renderToStaticMarkup(<CoverageChecklist coverage={undefined} />));
    expect(t).toContain("ran before WebGuard recorded what it checked");
    expect(t).not.toMatch(/ Checked /);
  });

  it("shows check ids and methods only in Developer Mode", () => {
    expect(renderToStaticMarkup(<CoverageChecklist coverage={cov} />)).not.toContain("site-headers ·");
    expect(renderToStaticMarkup(<CoverageChecklist coverage={cov} developer />)).toContain("site-headers ·");
  });
});
