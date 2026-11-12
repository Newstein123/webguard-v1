"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ExternalLink, Globe, RefreshCw } from "lucide-react";
import { useProject } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { GithubIcon } from "@/components/brand";
import { useScanRunner } from "@/components/scan-runner";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  const pathname = usePathname();
  const startScan = useStore((s) => s.startScan);
  const { start, running } = useScanRunner();

  if (!project)
    return (
      <Card>
        <EmptyState
          title="App not found"
          description="It may have been removed."
          action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>}
        />
      </Card>
    );

  const base = `/projects/${id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/findings`, label: "Findings" },
    { href: `${base}/scans`, label: "Scan history" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {project.repo && (
              <span className="flex items-center gap-1.5">
                <GithubIcon size={14} /> {project.repo}
              </span>
            )}
            {project.url && (
              <a href={project.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <Globe size={14} /> {project.url.replace("https://", "")} <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          disabled={running}
          onClick={() =>
            start({
              title: `Re-scanning ${project.name}`,
              begin: () => startScan(id),
            })
          }
        >
          <RefreshCw size={16} /> Re-scan now
        </Button>
      </div>

      <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
              isActive(t.href) ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
