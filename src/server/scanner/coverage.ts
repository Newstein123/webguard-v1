import { CHECKS, type CheckCoverage, type CheckId } from "@/lib/coverage";
import type { AnalyzerResult } from "./types";

/**
 * The coverage record for a completed scan: for every known check, whether it
 * ran (and on what) or why it did not. A check only counts as "ran" if its
 * analyzer reported it as covered, which is the same signal reconcile() uses
 * to resolve findings.
 */
export function buildCoverage(
  project: { source: "url" | "github"; url: string | null },
  results: AnalyzerResult[],
  siteError?: string,
): CheckCoverage[] {
  return CHECKS.map((def): CheckCoverage => {
    const r = results.find((x) => x.check === def.id);
    if (r?.covered.includes(def.id)) return { check: def.id, status: "ran", scope: r.scope ?? def.covers };
    if (r) return { check: def.id, status: "skipped", reason: r.skipped ?? "The check did not complete." };
    if (def.source === "repo" && project.source !== "github")
      return { check: def.id, status: "skipped", reason: "Needs a connected GitHub repository." };
    if (def.source === "site" && !project.url) return { check: def.id, status: "skipped", reason: "Needs the URL of your deployed site." };
    if (def.source === "site" && siteError) return { check: def.id, status: "skipped", reason: `Your live site couldn't be checked: ${siteError}` };
    return { check: def.id, status: "skipped", reason: "The check did not run." };
  });
}

/**
 * Run one analyzer so that an unexpected crash skips only that check instead
 * of failing the whole scan. covered stays empty, so its existing findings are
 * left untouched rather than resolved.
 */
export async function runCheck(check: CheckId, fn: () => AnalyzerResult | Promise<AnalyzerResult>, log: (e: unknown) => void = console.error): Promise<AnalyzerResult> {
  try {
    return await fn();
  } catch (e) {
    log(e);
    return {
      check,
      covered: [],
      findings: [],
      failed: true,
      skipped: "This check hit an unexpected error and was skipped. Its existing findings were left unchanged. Run the scan again.",
    };
  }
}

/** One line for the scan's warning, naming checks that were skipped because of an error. */
export function scanWarning(results: AnalyzerResult[], siteError?: string): string | null {
  const parts: string[] = [];
  if (siteError) parts.push(`Live site checks skipped: ${siteError}`);
  for (const r of results) if (r.failed) parts.push(`${CHECKS.find((c) => c.id === r.check)?.name ?? r.check} skipped: ${r.skipped}`);
  return parts.length ? parts.join(" ") : null;
}
