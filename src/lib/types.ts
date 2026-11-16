import type { CheckCoverage } from "./coverage";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

/** The 10 application-security areas WebGuard reports on. Descriptions live in coverage.ts. */
export const CATEGORIES = [
  "Code Security",
  "Authentication & Authorization",
  "API Security",
  "Database Security",
  "Secrets & Data Protection",
  "Dependency Security",
  "Frontend Security",
  "Infrastructure Security",
  "File & Input Security",
  "Runtime & Business Logic",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
  /** What each check did. Absent for failed scans and scans recorded before coverage existed. */
  coverage?: CheckCoverage[];
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
  /** Last scan whose analyzer actually detected this finding. */
  lastSeenScanId?: string;
  /** Id of the analyzer that owns this finding (fingerprint prefix, e.g. "rls"). */
  analyzer: string;
  ignoredReason?: string;
}

/** How findings are explained. Same findings either way; only presentation differs. */
export type ExplanationMode = "normal" | "developer";

export interface UserSettings {
  developerMode: boolean;
}

export interface CodeExample {
  label: string;
  lang: string;
  code: string;
}

export interface CweRef {
  /** e.g. "CWE-862" */
  id: string;
  name: string;
}

/** Rule-level knowledge used to build copy-paste instructions for AI coding assistants. */
export interface RuleAiFix {
  /** Plain-language description of the code change (Normal Mode prompt). */
  goal: string;
  /** Security behaviour the code must have after the fix (Developer Mode prompt). */
  expected: string[];
  /** Rule-specific limits on the change, in addition to the generic ones. */
  constraints?: string[];
  /** Steps the human must do outside the codebase (e.g. rotating a key). */
  manual?: string[];
  tests: { simple: string[]; technical: string[] };
}

export interface Rule {
  id: string;
  /** Plain-language title, shown in both modes. */
  title: string;
  /** Precise vulnerability name, shown in Developer Mode. */
  technicalTitle: string;
  category: Category;
  /** Normal Mode: what happened. */
  simple: string;
  /** Developer Mode: technical description of what the analyzer detects. */
  technical: string;
  whyItMatters: string;
  /** Normal Mode: what could happen to my application. */
  impact: string;
  /** Developer Mode. */
  rootCause: string;
  attackScenario: string;
  /** Developer Mode remediation strategy. */
  remediation: string[];
  cwe: CweRef[];
  /** Normal Mode fix steps. */
  steps: string[];
  examples: CodeExample[];
  ai: RuleAiFix;
  references?: { label: string; href: string }[];
}
