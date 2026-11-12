import type { Severity } from "@/lib/types";

/** A finding as produced by an analyzer, before it is reconciled with history. */
export interface RawFinding {
  ruleId: string;
  severity: Severity;
  /**
   * Stable identity across scans. MUST start with the producing analyzer id
   * followed by ":" so the engine knows which analyzer "owns" it.
   */
  fingerprint: string;
  location: string;
  /** Redacted. Never contains a full secret value. */
  evidence: string;
  evidenceLang?: string;
}

export interface AnalyzerResult {
  /** Analyzer ids that completed successfully, so their missing findings can be marked resolved. */
  covered: string[];
  findings: RawFinding[];
  /** Technologies noticed while scanning. */
  stackHints?: string[];
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface RepoSnapshot {
  owner: string;
  repo: string;
  ref: string;
  commit: { sha: string; message: string; author: string };
  files: RepoFile[];
  /** Paths of every file in the archive, including ones skipped for size/type. */
  allPaths: string[];
}
