export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export type Category =
  | "Secrets"
  | "Auth & Access"
  | "Database"
  | "Dependencies"
  | "Headers & TLS"
  | "Configuration";

export const CATEGORIES: Category[] = [
  "Secrets",
  "Auth & Access",
  "Database",
  "Dependencies",
  "Headers & TLS",
  "Configuration",
];

export type Schedule = "off" | "daily" | "weekly";

export interface MonitoringSettings {
  schedule: Schedule;
  githubWebhooks: boolean;
  webhookEvents: { push: boolean; pullRequest: boolean };
  branch: string;
  notifyEmail: boolean;
  notifySlack: boolean;
}

export interface Project {
  id: string;
  name: string;
  source: "url" | "github";
  url?: string;
  repo?: string;
  stack: string[];
  monitoring: MonitoringSettings;
  createdAt: string;
}

export type ScanTrigger = "initial" | "scheduled" | "github_push" | "manual";

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
}

export type SeverityCounts = Record<Severity, number>;

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface Scan {
  id: string;
  projectId: string;
  trigger: ScanTrigger;
  commit?: CommitInfo;
  status: ScanStatus;
  /** Human-readable stage labels and progress, for the live scan overlay. */
  stages: string[];
  stageIndex: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationSec: number;
  /** ids of findings open at the end of this scan */
  openFindingIds: string[];
  /** findings resolved by this scan */
  resolvedFindingIds: string[];
  /** findings first detected in this scan */
  newFindingIds: string[];
}

export type FindingStatus = "open" | "resolved" | "ignored";

export interface Finding {
  id: string;
  projectId: string;
  ruleId: string;
  severity: Severity;
  location: string;
  evidence: string;
  evidenceLang?: string;
  status: FindingStatus;
  firstSeenScanId: string;
  resolvedInScanId?: string;
  ignoredReason?: string;
}

export interface CodeExample {
  label: string;
  lang: string;
  code: string;
}

export interface Rule {
  id: string;
  title: string;
  category: Category;
  simple: string;
  technical: string;
  whyItMatters: string;
  steps: string[];
  examples: CodeExample[];
  references?: { label: string; href: string }[];
}
