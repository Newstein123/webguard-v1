/** Row ↔ domain mappers shared by the browser data layer and the server. */
import type { Finding, MonitoringSettings, Project, Scan } from "./types";

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  source: "url" | "github";
  repo: string | null;
  url: string | null;
  stack: string[];
  monitoring: MonitoringSettings;
  created_at: string;
}

export interface ScanRow {
  id: string;
  project_id: string;
  user_id: string;
  trigger: Scan["trigger"];
  status: Scan["status"];
  stages: string[];
  stage_index: number;
  error: string | null;
  commit: Scan["commit"] | null;
  started_at: string;
  finished_at: string | null;
  duration_sec: number;
  open_finding_ids: string[];
  new_finding_ids: string[];
  resolved_finding_ids: string[];
}

export interface FindingRow {
  id: string;
  project_id: string;
  user_id: string;
  rule_id: string;
  severity: Finding["severity"];
  fingerprint: string;
  location: string;
  evidence: string;
  evidence_lang: string | null;
  status: Finding["status"];
  ignored_reason: string | null;
  first_seen_scan_id: string | null;
  last_seen_scan_id: string | null;
  resolved_in_scan_id: string | null;
  created_at: string;
}

export const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  source: r.source,
  repo: r.repo ?? undefined,
  url: r.url ?? undefined,
  stack: r.stack,
  monitoring: r.monitoring,
  createdAt: r.created_at,
});

export const toScan = (r: ScanRow): Scan => ({
  id: r.id,
  projectId: r.project_id,
  trigger: r.trigger,
  commit: r.commit ?? undefined,
  status: r.status,
  stages: r.stages,
  stageIndex: r.stage_index,
  error: r.error ?? undefined,
  startedAt: r.started_at,
  finishedAt: r.finished_at ?? undefined,
  durationSec: r.duration_sec,
  openFindingIds: r.open_finding_ids,
  newFindingIds: r.new_finding_ids,
  resolvedFindingIds: r.resolved_finding_ids,
});

export const toFinding = (r: FindingRow): Finding => ({
  id: r.id,
  projectId: r.project_id,
  ruleId: r.rule_id,
  severity: r.severity,
  location: r.location,
  evidence: r.evidence,
  evidenceLang: r.evidence_lang ?? undefined,
  status: r.status,
  firstSeenScanId: r.first_seen_scan_id ?? "",
  resolvedInScanId: r.resolved_in_scan_id ?? undefined,
  ignoredReason: r.ignored_reason ?? undefined,
});
