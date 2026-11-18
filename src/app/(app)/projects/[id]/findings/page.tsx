"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronRight, Search, ShieldCheck, Wand2 } from "lucide-react";
import { useProject, useProjectFindings, useProjectVerification } from "@/lib/data";
import { RULES_BY_ID } from "@/lib/rules";
import { CATEGORIES, SEVERITIES, type Category, type FindingStatus, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, Input, Segmented, Select } from "@/components/ui";
import { FixAllPanel } from "@/components/fix-all-panel";
import { SeverityBadge } from "@/components/security";
import { useExplanationMode } from "@/components/developer-mode";
import { VerificationBadge } from "@/components/finding-explainer";

const STATUS_STYLE: Record<FindingStatus, string> = {
  open: "text-foreground",
  resolved: "text-ok",
  ignored: "text-muted",
};

export default function FindingsPage() {
  const { id } = useParams<{ id: string }>();
  const findings = useProjectFindings(id);
  const verification = useProjectVerification(id);
  const mode = useExplanationMode();
  const developer = mode === "developer";
  const project = useProject(id);
  // ?fixall=1 (from the overview) opens the fix-all prompt directly.
  const [fixAll, setFixAll] = useState(useSearchParams().get("fixall") === "1");
  const [status, setStatus] = useState<FindingStatus | "all">("open");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      all: findings.length,
      open: findings.filter((f) => f.status === "open").length,
      resolved: findings.filter((f) => f.status === "resolved").length,
      ignored: findings.filter((f) => f.status === "ignored").length,
    }),
    [findings],
  );

  const filtered = findings.filter((f) => {
    const rule = RULES_BY_ID[f.ruleId];
    if (status !== "all" && f.status !== status) return false;
    if (severity !== "all" && f.severity !== severity) return false;
    if (category !== "all" && rule?.category !== category) return false;
    if (q && !`${rule?.title} ${rule?.technicalTitle} ${f.ruleId} ${f.location}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openShown = filtered.filter((f) => f.status === "open");
  const narrowed = severity !== "all" || category !== "all" || q !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          className="self-start"
          options={(["open", "resolved", "ignored", "all"] as const).map((s) => ({
            value: s,
            label: (
              <span className="capitalize">
                {s} <span className="ml-1 text-xs text-muted tabular-nums">{counts[s]}</span>
              </span>
            ),
          }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings…" className="pl-9 sm:w-56" />
          </div>
          <div className="flex gap-2">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "all")} className="min-w-0 flex-1" aria-label="Severity">
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")} className="min-w-0 flex-1" aria-label="Category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {openShown.length
            ? `Fix ${narrowed ? "the" : "all"} ${openShown.length} open issue${openShown.length === 1 ? "" : "s"} ${narrowed ? "shown " : ""}with one prompt.`
            : ""}
        </p>
        <Button size="sm" variant={fixAll ? "secondary" : "outline"} onClick={() => setFixAll((v) => !v)} aria-expanded={fixAll} disabled={!openShown.length && !fixAll}>
          <Wand2 size={14} /> {fixAll ? "Hide fix-all prompt" : "Fix all with AI"}
        </Button>
      </div>
      {fixAll && <FixAllPanel findings={filtered} mode={mode} project={project} filtered={narrowed} />}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={28} className={status === "open" ? "text-ok" : undefined} />}
            title={status === "open" && !q && severity === "all" && category === "all" ? "No open issues 🎉" : "No findings match these filters"}
          />
        ) : (
          <>
            <div className="hidden grid-cols-[100px_1fr_150px_90px_20px] gap-4 border-b bg-surface-2 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-muted md:grid">
              <span>Severity</span>
              <span>Issue</span>
              <span>Category</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y">
              {filtered.map((f) => {
                const rule = RULES_BY_ID[f.ruleId];
                const v = verification.get(f.id);
                return (
                  <li key={f.id}>
                    <Link
                      href={`/projects/${id}/findings/${f.id}`}
                      className="grid grid-cols-[1fr_20px] items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-surface-2 md:grid-cols-[100px_1fr_150px_90px_20px]"
                    >
                      <span className="col-span-2 md:col-span-1">
                        <SeverityBadge severity={f.severity} />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-medium", f.status !== "open" && "text-muted line-through decoration-1")}>
                          {rule?.title}
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          {v && <VerificationBadge state={v} className="shrink-0 py-0 text-[11px]" />}
                          <span className="truncate font-mono text-xs text-muted">
                            {developer && <span className="text-foreground/70">{f.ruleId} · </span>}
                            {f.location}
                          </span>
                        </span>
                      </span>
                      <span className="hidden text-sm text-muted md:block">{rule?.category}</span>
                      <span className={cn("hidden text-sm capitalize md:block", STATUS_STYLE[f.status])}>{f.status}</span>
                      <ChevronRight size={16} className="text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
