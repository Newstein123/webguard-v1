"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  EyeOff,
  FileCode2,
  GraduationCap,
  Info,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { useFinding, useScan } from "@/lib/data";
import { useStore } from "@/lib/store";
import { RULES_BY_ID } from "@/lib/rules";
import { formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Input, LinkButton, Segmented } from "@/components/ui";
import { SeverityBadge } from "@/components/security";
import { CodeBlock, CodeTabs } from "@/components/code";
import { useScanRunner } from "@/components/scan-runner";

type Mode = "simple" | "technical";

export default function FindingDetail() {
  const { id, findingId } = useParams<{ id: string; findingId: string }>();
  const finding = useFinding(findingId);
  const firstSeen = useScan(finding?.firstSeenScanId ?? "");
  const resolvedIn = useScan(finding?.resolvedInScanId ?? "");
  const startScan = useStore((s) => s.startScan);
  const ignoreFinding = useStore((s) => s.ignoreFinding);
  const reopenFinding = useStore((s) => s.reopenFinding);
  const { start, running } = useScanRunner();
  const [mode, setMode] = useState<Mode>("simple");
  const [ignoring, setIgnoring] = useState(false);
  const [reason, setReason] = useState("");

  const rule = finding ? RULES_BY_ID[finding.ruleId] : undefined;
  if (!finding || !rule || finding.projectId !== id)
    return (
      <Card>
        <EmptyState title="Finding not found" action={<LinkButton href={`/projects/${id}/findings`}>Back to findings</LinkButton>} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <Link href={`/projects/${id}/findings`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} /> All findings
      </Link>

      {finding.status === "resolved" && (
        <div className="flex items-start gap-3 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <p className="font-medium text-ok">Resolved and verified</p>
            <p className="text-muted">
              Confirmed fixed by a{" "}
              {resolvedIn ? (
                <Link href={`/projects/${id}/scans/${resolvedIn.id}`} className="underline">
                  re-scan on {formatDateTime(resolvedIn.startedAt)}
                </Link>
              ) : (
                "re-scan"
              )}
              .
            </p>
          </div>
        </div>
      )}
      {finding.status === "ignored" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface-2 p-4 text-sm">
          <span className="flex items-center gap-2 text-muted">
            <EyeOff size={16} /> Ignored{finding.ignoredReason ? `: “${finding.ignoredReason}”` : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reopenFinding(finding.id).catch((e: Error) => toast.error(e.message))}
          >
            <RotateCcw size={14} /> Reopen
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <Badge>{rule.category}</Badge>
            {firstSeen && <span className="text-xs text-muted">First detected {formatDateTime(firstSeen.startedAt)}</span>}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{rule.title}</h2>
          <p className="mt-2 flex items-center gap-1.5 break-all font-mono text-sm text-muted">
            <FileCode2 size={14} className="shrink-0" /> {finding.location}
          </p>
        </div>
        {finding.status === "open" && (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => setIgnoring((v) => !v)}>
              <EyeOff size={16} /> Ignore
            </Button>
            <Button
              disabled={running}
              onClick={() =>
                start({
                  title: "Verifying your fix",
                  begin: () => startScan(id),
                })
              }
            >
              <RefreshCw size={16} /> Verify fix
            </Button>
          </div>
        )}
      </div>

      {ignoring && finding.status === "open" && (
        <Card className="p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await ignoreFinding(finding.id, reason.trim());
                setIgnoring(false);
                toast("Finding ignored", { description: "It won’t count toward your score." });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not ignore finding");
              }
            }}
          >
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. accepted risk, false positive)" />
            <Button type="submit" variant="secondary">
              Ignore finding
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Explanation */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <h3 className="font-semibold">What’s wrong</h3>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "simple", label: <span className="flex items-center gap-1.5"><GraduationCap size={14} /> Simple</span> },
                  { value: "technical", label: <span className="flex items-center gap-1.5"><FileCode2 size={14} /> Technical</span> },
                ]}
              />
            </div>
            <div className="p-5">
              <p className="leading-relaxed">
                <RichText text={mode === "simple" ? rule.simple : rule.technical} />
              </p>
            </div>
          </Card>

          <Card className="border-high/30">
            <div className="flex gap-3 p-5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-high" />
              <div>
                <h3 className="font-semibold">Why it matters</h3>
                <p className="mt-1 leading-relaxed text-muted">{rule.whyItMatters}</p>
              </div>
            </div>
          </Card>

          {/* Fix */}
          <Card>
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <Wrench size={16} className="text-primary" />
              <h3 className="font-semibold">How to fix it</h3>
            </div>
            <div className="space-y-5 p-5">
              <ol className="space-y-3">
                {rule.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed">
                      <RichText text={s} />
                    </span>
                  </li>
                ))}
              </ol>
              <CodeTabs examples={rule.examples} />
              <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
                <Info size={14} className="mt-0.5 shrink-0" />
                These are suggestions. Review every change and test it before you apply it to production, because you are responsible for the code you ship.
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="border-b px-5 py-3">
              <h3 className="font-semibold">Evidence</h3>
              <p className="text-xs text-muted">What WebGuard observed</p>
            </div>
            <div className="p-4">
              <CodeBlock code={finding.evidence} lang={finding.evidenceLang} />
              <p className="mt-2 text-xs text-muted">Secret values are redacted. WebGuard never stores full keys.</p>
            </div>
          </Card>

          {finding.status === "open" && (
            <Card className="p-5">
              <p className="font-medium">Applied the fix?</p>
              <p className="mt-1 text-sm text-muted">
                Run a re-scan to confirm the issue is gone. Make sure the fix is pushed to GitHub or deployed first.
              </p>
              <Button
                className="mt-4 w-full"
                disabled={running}
                onClick={() => start({ title: "Verifying your fix", begin: () => startScan(id) })}
              >
                <RefreshCw size={16} /> Verify fix now
              </Button>
            </Card>
          )}

          {rule.references && (
            <Card className="p-5">
              <p className="flex items-center gap-2 font-medium">
                <BookOpen size={16} /> Learn more
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {rule.references.map((r) => (
                  <li key={r.href}>
                    <a href={r.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {r.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders `inline code` segments. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
