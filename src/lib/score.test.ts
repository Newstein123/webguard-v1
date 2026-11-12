import { describe, expect, it } from "vitest";
import { securityScore, scoreGrade } from "./utils";
import type { Severity } from "./types";

const f = (ruleId: string, severity: Severity, n = 1) => Array.from({ length: n }, () => ({ ruleId, severity }));

describe("securityScore", () => {
  it("is 100 with nothing open", () => expect(securityScore([])).toBe(100));

  it("caps dependency noise instead of hitting zero (Promptopia case)", () => {
    const open = [
      ...f("vulnerable-dependency", "critical", 3),
      ...f("vulnerable-dependency", "high", 10),
      ...f("vulnerable-dependency", "medium", 7),
      ...f("vulnerable-dependency", "low", 1),
      ...f("env-file-committed", "high"),
      ...f("missing-security-headers", "medium"),
    ];
    const score = securityScore(open);
    expect(score).toBe(48); // 100 - 35 (deps cap) - 12 (.env) - 5 (headers)
    expect(scoreGrade(score).grade).toBe("D");
  });

  it("never rates an app with an open critical as better than D", () => {
    expect(securityScore(f("supabase-rls-permissive", "critical"))).toBe(49);
    expect(scoreGrade(securityScore(f("supabase-rls-permissive", "critical"))).grade).toBe("D");
  });

  it("caps an app with only high issues at C", () => {
    expect(securityScore(f("hardcoded-secret", "high"))).toBe(74);
  });

  it("still reaches zero for many real leaks", () => {
    expect(securityScore([...f("hardcoded-secret", "critical", 3), ...f("supabase-rls-disabled", "critical", 2)])).toBe(0);
  });

  it("improves when a dependency issue is fixed only once under the cap", () => {
    const many = f("vulnerable-dependency", "medium", 10); // 50 → capped at 35
    expect(securityScore(many)).toBe(65);
    expect(securityScore(many.slice(1))).toBe(65);
    expect(securityScore(many.slice(4))).toBe(70);
  });
});
