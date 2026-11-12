"use client";

import Link from "next/link";
import { Globe, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { useProjects, useProjectSummary } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import { countBySeverity, timeAgo } from "@/lib/utils";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { ScoreChip, SeverityBar, SeverityCounts, TriggerBadge } from "@/components/security";
import { GithubIcon } from "@/components/brand";

export default function DashboardPage() {
  const projects = useProjects();
  const findings = useStore((s) => s.findings);
  const open = findings.filter((f) => f.status === "open");
  const resolved = findings.filter((f) => f.status === "resolved");
  const totals = countBySeverity(open);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your apps</h1>
          <p className="mt-1 text-sm text-muted">Security status for every app you’ve connected.</p>
        </div>
        <LinkButton href="/projects/new">
          <Plus size={16} /> Add app
        </LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Open issues" value={open.length} icon={<ShieldAlert size={18} className="text-high" />}>
          <SeverityCounts counts={totals} className="mt-2 gap-2 text-xs" />
        </Stat>
        <Stat label="Critical & high" value={totals.critical + totals.high} icon={<ShieldAlert size={18} className="text-critical" />}>
          <p className="mt-2 text-xs text-muted">Fix these first.</p>
        </Stat>
        <Stat label="Issues resolved" value={resolved.length} icon={<ShieldCheck size={18} className="text-ok" />}>
          <p className="mt-2 text-xs text-muted">Each one confirmed fixed by a re-scan.</p>
        </Stat>
      </div>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck size={32} />}
            title="No apps connected yet"
            description="Connect a website URL or GitHub repo to run your first security assessment."
            action={<LinkButton href="/projects/new"><Plus size={16} /> Add your first app</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          <Link
            href="/projects/new"
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={22} />
            <span className="text-sm font-medium">Connect another app</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, children }: { label: string; value: number; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {children}
    </Card>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const { open, score, lastScan } = useProjectSummary(p.id);
  const counts = countBySeverity(open);
  return (
    <Link href={`/projects/${p.id}`} className="group">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-primary/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted">
              {p.source === "github" ? <GithubIcon size={13} /> : <Globe size={13} />}
              {p.repo ?? p.url?.replace("https://", "")}
            </p>
          </div>
          <ScoreChip score={score} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.stack.map((s) => (
            <span key={s} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {s}
            </span>
          ))}
        </div>
        <SeverityBar counts={counts} className="mt-5" />
        <SeverityCounts counts={counts} className="mt-3" />
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted" style={{ marginTop: 20 }}>
          {lastScan ? (
            <span className="flex items-center gap-1.5">
              <TriggerBadge trigger={lastScan.trigger} /> {timeAgo(lastScan.startedAt)}
            </span>
          ) : (
            <span>No completed scan yet</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
