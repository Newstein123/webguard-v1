/**
 * Re-scan verification status of a finding.
 *
 * This is read-only interpretation of what the scan engine already recorded
 * (see reconcile() in src/server/scanner/engine.ts). It never changes a
 * finding's status: only a scan whose analyzer completed and no longer
 * detects the issue can mark it resolved.
 */
import type { Finding, Scan } from "./types";

export type VerificationKind = "resolved" | "still_present" | "regressed" | "new" | "manual_review";

export type VerificationState =
  | { kind: "resolved"; scanId: string }
  | { kind: "still_present"; scanId: string }
  | { kind: "regressed"; scanId: string }
  | { kind: "new"; scanId: string }
  | { kind: "manual_review"; scanId: string; reason: "scan_failed" | "analyzer_skipped" };

type ScanLike = Pick<Scan, "id" | "status" | "startedAt" | "newFindingIds">;
type FindingLike = Pick<Finding, "id" | "status" | "firstSeenScanId" | "lastSeenScanId" | "resolvedInScanId">;

/**
 * @param scans every scan of the finding's project, in any order.
 * @returns null when there is nothing to compare yet (only the first scan) or the finding is ignored.
 */
export function verifyFinding(finding: FindingLike, scans: ScanLike[]): VerificationState | null {
  if (finding.status === "ignored") return null;
  if (finding.status === "resolved") {
    return finding.resolvedInScanId ? { kind: "resolved", scanId: finding.resolvedInScanId } : null;
  }

  const sorted = [...scans].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const completed = sorted.filter((s) => s.status === "completed");
  const latest = completed[0];
  if (!latest) return null;

  // The most recent verification attempt failed: the issue may or may not still be there.
  const lastFinished = sorted.find((s) => s.status === "completed" || s.status === "failed");
  if (lastFinished && lastFinished.status === "failed") {
    return { kind: "manual_review", scanId: lastFinished.id, reason: "scan_failed" };
  }

  // The analyzer that owns this finding did not complete in the latest scan, so it was not re-checked.
  if (finding.lastSeenScanId && finding.lastSeenScanId !== latest.id) {
    return { kind: "manual_review", scanId: latest.id, reason: "analyzer_skipped" };
  }

  if (latest.newFindingIds.includes(finding.id)) {
    if (finding.firstSeenScanId !== latest.id) return { kind: "regressed", scanId: latest.id };
    // First detection: only meaningful when there was an earlier scan to compare against.
    return completed.length > 1 ? { kind: "new", scanId: latest.id } : null;
  }
  return completed.length > 1 ? { kind: "still_present", scanId: latest.id } : null;
}

export const VERIFICATION_LABEL: Record<VerificationKind, string> = {
  resolved: "Verified fixed",
  still_present: "Still detected",
  regressed: "Regressed",
  new: "New",
  manual_review: "Needs review",
};

export function verificationDescription(state: VerificationState): string {
  switch (state.kind) {
    case "resolved":
      return "A re-scan ran the check for this issue and no longer detected it.";
    case "still_present":
      return "The latest re-scan ran the check for this issue and still detected it.";
    case "regressed":
      return "This issue was fixed before, but the latest re-scan detected it again.";
    case "new":
      return "First detected in the latest scan.";
    case "manual_review":
      return state.reason === "scan_failed"
        ? "The latest scan failed, so WebGuard could not check whether this issue is fixed. Run the scan again."
        : "The check for this issue did not run in the latest scan (for example the site or repository could not be reached), so it was not re-verified.";
  }
}
