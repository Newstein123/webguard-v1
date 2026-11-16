import { describe, expect, it } from "vitest";
import { verifyFinding } from "./verification";
import { finding, scan } from "./__tests__/fixtures";

const s1 = scan("s1", "2026-11-01T00:00:00Z", { trigger: "initial", newFindingIds: ["f1"] });

describe("verifyFinding", () => {
  it("has nothing to compare after only the initial scan", () => {
    expect(verifyFinding(finding(), [s1])).toBeNull();
  });

  it("is still present when the analyzer re-ran and saw it again", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z");
    expect(verifyFinding(finding({ lastSeenScanId: "s2" }), [s1, s2])).toEqual({ kind: "still_present", scanId: "s2" });
  });

  it("is resolved only via the scan that recorded the resolution", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { resolvedFindingIds: ["f1"] });
    expect(verifyFinding(finding({ status: "resolved", resolvedInScanId: "s2" }), [s1, s2])).toEqual({ kind: "resolved", scanId: "s2" });
  });

  it("never treats an open finding as resolved, whatever the scans say", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { resolvedFindingIds: ["f1"] });
    expect(verifyFinding(finding({ lastSeenScanId: "s2" }), [s1, s2])?.kind).not.toBe("resolved");
  });

  it("detects regressions: resolved earlier, detected again in the latest scan", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { resolvedFindingIds: ["f1"] });
    const s3 = scan("s3", "2026-11-03T00:00:00Z", { newFindingIds: ["f1"] });
    expect(verifyFinding(finding({ lastSeenScanId: "s3" }), [s3, s1, s2])).toEqual({ kind: "regressed", scanId: "s3" });
  });

  it("marks first detections after the initial scan as new", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { newFindingIds: ["f2"] });
    expect(verifyFinding(finding({ id: "f2", firstSeenScanId: "s2", lastSeenScanId: "s2" }), [s1, s2])).toEqual({ kind: "new", scanId: "s2" });
  });

  it("needs manual review when the owning analyzer did not run in the latest scan", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { error: "Live site checks skipped: timeout" });
    expect(verifyFinding(finding({ lastSeenScanId: "s1" }), [s1, s2])).toEqual({ kind: "manual_review", scanId: "s2", reason: "analyzer_skipped" });
  });

  it("needs manual review when the latest verification scan failed", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { status: "failed" });
    expect(verifyFinding(finding(), [s1, s2])).toEqual({ kind: "manual_review", scanId: "s2", reason: "scan_failed" });
  });

  it("ignores scans that are still running", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z", { status: "running" });
    expect(verifyFinding(finding(), [s1, s2])).toBeNull();
  });

  it("returns nothing for ignored findings", () => {
    const s2 = scan("s2", "2026-11-02T00:00:00Z");
    expect(verifyFinding(finding({ status: "ignored", lastSeenScanId: "s2" }), [s1, s2])).toBeNull();
  });
});
