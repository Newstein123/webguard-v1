"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useProject, useProjectSummary } from "@/lib/data";
import { RULES_BY_ID } from "@/lib/rules";
import { countBySeverity, scoreGrade } from "@/lib/utils";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { ScoreGauge, SeverityBadge, SeverityBar, SeverityCounts } from "@/components/security";
import { ScanTimeline } from "@/components/scan-timeline";
import { TrendChart } from "@/components/trend-chart";

export default function ProjectOverview() {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id)!;
  const { open, score, scans, findings } = useProjectSummary(id);
  const counts = countBySeverity(open);
  const { label } = scoreGrade(score);
  const resolvedCount = findings.filter((f) => f.status === "resolved").length;
  const top = open.slice(0, 4);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card className="grid gap-6 p-6 sm:grid-cols-[auto_1fr]">
          <ScoreGauge score={score} />
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted">Security score</p>
            <p className="mt-1 text-lg font-semibold">
              {open.length === 0
                ? "No open issues. Your app looks solid."
                : `${label}: ${open.length} open issue${open.length === 1 ? "" : "s"}`}
            </p>
            <SeverityBar counts={counts} className="mt-4" />
            <SeverityCounts counts={counts} showZero className="mt-3" />
            <p className="mt-4 text-xs text-muted">
              {resolvedCount} issue{resolvedCount === 1 ? "" : "s"} resolved since you connected this app.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Fix these first"
            description="Your highest-impact open issues"
            action={
              <Link href={`/projects/${id}/findings`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                All findings <ArrowRight size={14} />
              </Link>
            }
          />
          {top.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={28} className="text-ok" />} title="Nothing to fix right now" description="Re-scan after you ship changes to stay on top of new issues." />
          ) : (
            <ul className="divide-y">
              {top.map((f) => (
                <li key={f.id}>
                  <Link href={`/projects/${id}/findings/${f.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                    <SeverityBadge severity={f.severity} className="w-20 justify-center" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{RULES_BY_ID[f.ruleId]?.title}</p>
                      <p className="truncate font-mono text-xs text-muted">{f.location}</p>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Security trend" description="Score and open issues across scans" />
          <div className="p-4">
            <TrendChart scans={scans} findings={findings} />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <p className="text-sm font-medium">Coverage</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {project.repo && <li>Source code: secrets, dependencies, database policies</li>}
            {project.url ? <li>Live site: security headers, keys in JavaScript</li> : <li>Add a deployed URL to also check your live site</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">Automatic monitoring is coming soon. For now, re-scan after each change.</p>
        </Card>

        <Card>
          <CardHeader
            title="Recent scans"
            action={
              <LinkButton href={`/projects/${id}/scans`} variant="ghost" size="sm">
                All
              </LinkButton>
            }
          />
          <div className="p-2">
            <ScanTimeline scans={scans} projectId={id} limit={5} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium">Detected stack</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.stack.map((s) => (
              <span key={s} className="rounded-md border bg-surface-2 px-2 py-1 text-xs">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Fix instructions are tailored to these technologies.</p>
        </Card>
      </div>
    </div>
  );
}
