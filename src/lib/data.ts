"use client";

/**
 * Data access layer. Every page reads through these hooks. They are backed by
 * Supabase via store.ts (RLS-scoped to the signed-in user).
 */
import { useMemo } from "react";
import { useStore } from "./store";
import { RULES_BY_ID } from "./rules";
import { SEVERITY_ORDER, securityScore } from "./utils";
import { verifyFinding, type VerificationState } from "./verification";
import type { Finding } from "./types";

export function useProjects() {
  return useStore((s) => s.projects);
}

export function useProject(id: string) {
  return useStore((s) => s.projects.find((p) => p.id === id));
}

export function useProjectFindings(projectId: string) {
  const findings = useStore((s) => s.findings);
  return useMemo(
    () =>
      findings
        .filter((f) => f.projectId === projectId)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [findings, projectId],
  );
}

export function useFinding(id: string) {
  return useStore((s) => s.findings.find((f) => f.id === id));
}

export function useProjectScans(projectId: string) {
  const scans = useStore((s) => s.scans);
  return useMemo(
    () =>
      scans
        .filter((s) => s.projectId === projectId && s.status === "completed")
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [scans, projectId],
  );
}

export function useScan(id: string) {
  return useStore((s) => s.scans.find((x) => x.id === id));
}

export function useAllScans() {
  const scans = useStore((s) => s.scans);
  return useMemo(
    () => scans.filter((s) => s.status === "completed" || s.status === "failed").sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [scans],
  );
}

export function useFindingsMap() {
  const findings = useStore((s) => s.findings);
  return useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
}

/** Summary used on dashboard cards and project overview. */
export function useProjectSummary(projectId: string) {
  const findings = useProjectFindings(projectId);
  const scans = useProjectScans(projectId);
  return useMemo(() => {
    const open = findings.filter((f) => f.status === "open");
    return { open, score: securityScore(open), lastScan: scans[0], scans, findings };
  }, [findings, scans]);
}

/**
 * Re-scan verification state for each of a project's findings, keyed by finding id.
 * Uses every scan (including failed ones) so a failed verification is visible.
 */
export function useProjectVerification(projectId: string): Map<string, VerificationState | null> {
  const scans = useStore((s) => s.scans);
  const findings = useProjectFindings(projectId);
  return useMemo(() => {
    const history = scans.filter((s) => s.projectId === projectId);
    return new Map(findings.map((f: Finding) => [f.id, verifyFinding(f, history)]));
  }, [scans, findings, projectId]);
}

export function getRule(ruleId: string) {
  return RULES_BY_ID[ruleId];
}
