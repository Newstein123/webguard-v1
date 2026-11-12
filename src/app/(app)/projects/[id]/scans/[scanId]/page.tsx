"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronRight, GitCommitHorizontal } from "lucide-react";
import { useFindingsMap, useProjectScans, useScan } from "@/lib/data";
import { RULES_BY_ID } from "@/lib/rules";
import type { Finding } from "@/lib/types";
import { SEVERITY_ORDER, countBySeverity, formatDateTime, formatDuration, securityScore } from "@/lib/utils";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { ScoreChip, SeverityBadge, SeverityCounts, TriggerBadge } from "@/components/security";

export default function ScanDetail() {
  const { id, scanId } = useParams<{ id: string; scanId: string }>();
  const scan = useScan(scanId);
  const scans = useProjectScans(id);
  const fmap = useFindingsMap();

  if (!scan || scan.projectId !== id)
    return (
      <Card>
        <EmptyState title="Scan not found" action={<LinkButton href={`/projects/${id}/scans`}>Scan history</LinkButton>} />
      </Card>
    );

  const idx = scans.findIndex((s) => s.id === scan.id);
  const prev = scans[idx + 1];
  const resolve = (ids: string[]) =>
    ids
      .map((i) => fmap.get(i))
      .filter((f): f is Finding => !!f)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const open = resolve(scan.openFindingIds);
  const added = resolve(scan.newFindingIds);
  const resolved = resolve(scan.resolvedFindingIds);
  const unchanged = open.filter((f) => !scan.newFindingIds.includes(f.id));
  const score = securityScore(open);
  const prevScore = prev ? securityScore(resolve(prev.openFindingIds)) : undefined;

  return (
    <div className="space-y-6">
      <Link href={`/projects/${id}/scans`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} /> Scan history
      </Link>

      <Card className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <TriggerBadge trigger={scan.trigger} />
            <h2 className="text-xl font-semibold">{formatDateTime(scan.startedAt)}</h2>
            {scan.commit && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <GitCommitHorizontal size={16} className="text-muted" />
                <span className="rounded bg-surface-2 px-1.5 font-mono text-xs">{scan.commit.sha}</span>
                <span className="font-medium">{scan.commit.message}</span>
                <span className="text-muted">by {scan.commit.author}</span>
              </p>
            )}
            <p className="text-sm text-muted">
              {scan.status === "failed" ? "Failed" : "Completed"} in {formatDuration(scan.durationSec)}
            </p>
            {scan.error && <p className="text-sm text-high">{scan.error}</p>}
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-muted">Score</p>
              <ScoreChip score={score} />
              {prevScore !== undefined && prevScore !== score && (
                <p className={`text-xs font-medium ${score > prevScore ? "text-ok" : "text-high"}`}>
                  {score > prevScore ? "▲" : "▼"} {Math.abs(score - prevScore)} vs previous
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t pt-4">
          <SeverityCounts counts={countBySeverity(open)} showZero />
        </div>
      </Card>

      {scan.trigger !== "initial" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DiffStat label="Resolved" value={resolved.length} className="text-ok" />
          <DiffStat label="New" value={added.length} className="text-high" />
          <DiffStat label="Still open" value={unchanged.length} className="text-foreground" />
        </div>
      )}

      {scan.trigger !== "initial" && resolved.length > 0 && <FindingList title="Resolved in this scan" tone="ok" findings={resolved} projectId={id} />}
      {added.length > 0 && (
        <FindingList title={scan.trigger === "initial" ? "Issues found" : "New in this scan"} tone="high" findings={added} projectId={id} />
      )}
      {scan.trigger !== "initial" && unchanged.length > 0 && <FindingList title="Still open" findings={unchanged} projectId={id} />}
    </div>
  );
}

function DiffStat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${className}`}>{value}</p>
    </Card>
  );
}

function FindingList({ title, findings, projectId, tone }: { title: string; findings: Finding[]; projectId: string; tone?: "ok" | "high" }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {tone && <span className={`h-2 w-2 rounded-full ${tone === "ok" ? "bg-ok" : "bg-high"}`} />}
            {title}
          </span>
        }
      />
      <ul className="divide-y">
        {findings.map((f) => (
          <li key={f.id}>
            <Link href={`/projects/${projectId}/findings/${f.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2">
              <SeverityBadge severity={f.severity} className="w-20 justify-center" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${tone === "ok" ? "text-muted line-through" : ""}`}>{RULES_BY_ID[f.ruleId]?.title}</p>
                <p className="truncate font-mono text-xs text-muted">{f.location}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
