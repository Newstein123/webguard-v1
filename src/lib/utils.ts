import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Category, Finding, Schedule, ScanTrigger, Severity, SeverityCounts } from "./types";
import { RULES_BY_ID } from "./rules";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WEIGHTS: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2, info: 0 };

/**
 * The most a single category can subtract. Many small issues of one kind
 * (e.g. 20 transitive npm advisories, or five missing headers) should not
 * outweigh one real data leak. Categories not listed are uncapped.
 */
const CATEGORY_CAP: Partial<Record<Category, number>> = {
  Dependencies: 35,
  "Headers & TLS": 10,
  Configuration: 20,
};

/** Severity sets a ceiling: a single open critical can never look "Good". */
const SEVERITY_CEILING: Partial<Record<Severity, number>> = { critical: 49, high: 74 };

/** Security score 0–100 from open findings. Pure, so it is recomputed for every historic scan. */
export function securityScore(open: Pick<Finding, "severity" | "ruleId">[]): number {
  const byCategory = new Map<string, number>();
  let ceiling = 100;
  for (const f of open) {
    const category = RULES_BY_ID[f.ruleId]?.category ?? "Configuration";
    byCategory.set(category, (byCategory.get(category) ?? 0) + WEIGHTS[f.severity]);
    ceiling = Math.min(ceiling, SEVERITY_CEILING[f.severity] ?? 100);
  }
  let penalty = 0;
  for (const [category, p] of byCategory) penalty += Math.min(p, CATEGORY_CAP[category as Category] ?? Infinity);
  return Math.max(0, Math.min(ceiling, 100 - penalty));
}

export function scoreGrade(score: number): { grade: string; label: string; tone: "ok" | "medium" | "high" | "critical" } {
  if (score >= 90) return { grade: "A", label: "Strong", tone: "ok" };
  if (score >= 75) return { grade: "B", label: "Good", tone: "ok" };
  if (score >= 60) return { grade: "C", label: "Needs work", tone: "medium" };
  if (score >= 40) return { grade: "D", label: "At risk", tone: "high" };
  return { grade: "F", label: "Critical risk", tone: "critical" };
}

export function countBySeverity(findings: Pick<Finding, "severity">[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 0) return "in " + timeUntil(iso, now);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function timeUntil(iso: string, now = Date.now()): string {
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${sec % 60}s` : `${sec}s`;
}

export function nextRun(schedule: Schedule, lastIso?: string): string | null {
  if (schedule === "off") return null;
  const interval = schedule === "daily" ? 86_400_000 : 7 * 86_400_000;
  let t = lastIso ? new Date(lastIso).getTime() + interval : Date.now() + interval;
  while (t < Date.now()) t += interval;
  return new Date(t).toISOString();
}

export const TRIGGER_LABEL: Record<ScanTrigger, string> = {
  initial: "Initial assessment",
  scheduled: "Scheduled",
  github_push: "GitHub push",
  manual: "Manual re-scan",
};
