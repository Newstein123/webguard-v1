import { describe, expect, it } from "vitest";
import { CHECKS, categoryCoverage, checkedAreaCount, type CheckCoverage } from "./coverage";
import { CATEGORIES } from "./types";

const ranAll: CheckCoverage[] = CHECKS.map((c) => ({ check: c.id, status: "ran", scope: "x" }));
const status = (cov: CheckCoverage[] | undefined) => Object.fromEntries(categoryCoverage(cov).map((c) => [c.category, c.status]));

describe("categoryCoverage", () => {
  it("lists all 10 areas, in order", () => {
    expect(categoryCoverage(ranAll).map((c) => c.category)).toEqual([...CATEGORIES]);
    expect(CATEGORIES).toHaveLength(10);
  });

  it("only areas with a real check can be checked; the rest are 'not checked yet'", () => {
    const s = status(ranAll);
    expect(s).toEqual({
      "Code Security": "not_available",
      "Authentication & Authorization": "not_available",
      "API Security": "checked",
      "Database Security": "checked",
      "Secrets & Data Protection": "checked",
      "Dependency Security": "checked",
      "Frontend Security": "checked",
      "Infrastructure Security": "not_available",
      "File & Input Security": "not_available",
      "Runtime & Business Logic": "not_available",
    });
    expect(checkedAreaCount(ranAll)).toBe(5);
  });

  it("is partial when only some of an area's checks ran, and skipped when none did", () => {
    const cov = ranAll.map((c): CheckCoverage =>
      c.check === "site-bundle" || c.check === "deps" ? { check: c.check, status: "skipped", reason: "r" } : c,
    );
    const s = status(cov);
    expect(s["Secrets & Data Protection"]).toBe("partial");
    expect(s["Dependency Security"]).toBe("skipped");
    expect(checkedAreaCount(cov)).toBe(4);
  });

  it("treats a missing check entry as not run", () => {
    expect(status([{ check: "rls", status: "ran", scope: "x" }])["Frontend Security"]).toBe("skipped");
  });

  it("does not guess for scans recorded before coverage existed", () => {
    const s = status(undefined);
    expect(s["Database Security"]).toBe("unknown");
    expect(s["Code Security"]).toBe("not_available");
    expect(checkedAreaCount(undefined)).toBe(0);
  });
});
