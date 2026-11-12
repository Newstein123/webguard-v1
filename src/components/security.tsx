"use client";

import { GitCommitHorizontal, Clock, Hand, Sparkles, ShieldCheck } from "lucide-react";
import type { ScanTrigger, Severity, SeverityCounts } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { cn, scoreGrade, TRIGGER_LABEL } from "@/lib/utils";

export const SEV_TEXT: Record<Severity, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-info",
};
export const SEV_BG: Record<Severity, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
  info: "bg-info",
};
const SEV_CHIP: Record<Severity, string> = {
  critical: "bg-critical/12 text-critical border-critical/30",
  high: "bg-high/12 text-high border-high/30",
  medium: "bg-medium/12 text-medium border-medium/30",
  low: "bg-low/12 text-low border-low/30",
  info: "bg-info/12 text-info border-info/30",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold capitalize",
        SEV_CHIP[severity],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", SEV_BG[severity])} />
      {severity}
    </span>
  );
}

/** Compact row of severity counts, hides zeroes unless showZero. */
export function SeverityCounts({ counts, showZero = false, className }: { counts: SeverityCounts; showZero?: boolean; className?: string }) {
  const items = SEVERITIES.filter((s) => s !== "info" && (showZero || counts[s] > 0));
  if (!items.length)
    return (
      <span className={cn("inline-flex items-center gap-1 text-sm text-ok", className)}>
        <ShieldCheck size={14} /> No open issues
      </span>
    );
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", SEV_BG[s])} />
          <span className="font-semibold tabular-nums">{counts[s]}</span>
          <span className="capitalize text-muted">{s}</span>
        </span>
      ))}
    </div>
  );
}

/** Horizontal stacked bar of severity distribution. */
export function SeverityBar({ counts, className }: { counts: SeverityCounts; className?: string }) {
  const total = SEVERITIES.reduce((n, s) => n + counts[s], 0);
  return (
    <div className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2", className)}>
      {total === 0 ? (
        <div className="h-full w-full bg-ok/60" />
      ) : (
        SEVERITIES.map((s) =>
          counts[s] ? <div key={s} className={cn("h-full", SEV_BG[s])} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null,
        )
      )}
    </div>
  );
}

const TONE_STROKE = { ok: "var(--ok)", medium: "var(--sev-medium)", high: "var(--sev-high)", critical: "var(--sev-critical)" };
const TONE_TEXT = { ok: "text-ok", medium: "text-medium", high: "text-high", critical: "text-critical" };

export function ScoreGauge({ score, size = 140, showLabel = true }: { score: number; size?: number; showLabel?: boolean }) {
  const { grade, label, tone } = scoreGrade(score);
  const stroke = size / 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[135deg]">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE_STROKE[tone]}
            strokeWidth={stroke}
            strokeDasharray={`${(arc * score) / 100} ${c}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 800ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold tabular-nums" style={{ fontSize: size * 0.26 }}>
            {score}
          </span>
          <span className={cn("font-semibold", TONE_TEXT[tone])} style={{ fontSize: size * 0.1 }}>
            Grade {grade}
          </span>
        </div>
      </div>
      {showLabel && <span className={cn("-mt-2 text-sm font-medium", TONE_TEXT[tone])}>{label}</span>}
    </div>
  );
}

export function ScoreChip({ score }: { score: number }) {
  const { grade, tone } = scoreGrade(score);
  return (
    <span className={cn("inline-flex items-baseline gap-1 font-semibold tabular-nums", TONE_TEXT[tone])}>
      <span className="text-2xl">{score}</span>
      <span className="text-xs">/100 · {grade}</span>
    </span>
  );
}

const TRIGGER_ICON: Record<ScanTrigger, React.ComponentType<{ size?: number; className?: string }>> = {
  initial: Sparkles,
  scheduled: Clock,
  github_push: GitCommitHorizontal,
  manual: Hand,
};

export function TriggerBadge({ trigger, className }: { trigger: ScanTrigger; className?: string }) {
  const Icon = TRIGGER_ICON[trigger];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border bg-surface-2 px-2 py-0.5 text-xs font-medium", className)}>
      <Icon size={12} className="text-muted" />
      {TRIGGER_LABEL[trigger]}
    </span>
  );
}

export function TriggerIcon({ trigger, size = 16, className }: { trigger: ScanTrigger; size?: number; className?: string }) {
  const Icon = TRIGGER_ICON[trigger];
  return <Icon size={size} className={className} />;
}
