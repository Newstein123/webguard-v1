"use client";

import Link from "next/link";
import { useAllScans, useProjects } from "@/lib/data";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui";
import { TriggerIcon } from "@/components/security";
import { ScanSummaryText } from "@/components/scan-timeline";

export default function ActivityPage() {
  const scans = useAllScans();
  const projects = useProjects();
  const names = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted">Every scan across your apps: scheduled, GitHub-triggered, and manual.</p>
      </div>
      <Card>
        <CardHeader title="Recent scans" description={`${scans.length} scans`} />
        <ul className="divide-y">
          {scans.slice(0, 50).map((s) => (
            <li key={s.id}>
              <Link href={`/projects/${s.projectId}/scans/${s.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <TriggerIcon trigger={s.trigger} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{names.get(s.projectId)}</span>
                    <span className="text-muted"> · </span>
                    <ScanSummaryText scan={s} />
                  </p>
                  <p className="truncate text-xs text-muted">
                    {s.commit ? (
                      <>
                        <span className="font-mono">{s.commit.sha}</span> {s.commit.message} · {s.commit.author}
                      </>
                    ) : (
                      formatDateTime(s.startedAt)
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(s.startedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
