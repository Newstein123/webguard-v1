"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardCopy,
  Code2,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Wand2,
  Wrench,
} from "lucide-react";
import type { ExplanationMode, Finding, Project, Rule } from "@/lib/types";
import { advisoryRefs, affectedResources, analyzerInfo, cweHref } from "@/lib/finding-details";
import { buildFixPrompt } from "@/lib/fix-prompt";
import { VERIFICATION_LABEL, verificationDescription, type VerificationKind, type VerificationState } from "@/lib/verification";
import { cn } from "@/lib/utils";
import { Badge, Button, Card } from "./ui";
import { CodeBlock, CodeTabs } from "./code";
import { SeverityBadge } from "./security";

type FindingProps = {
  finding: Finding;
  rule: Rule;
  mode: ExplanationMode;
  project?: Pick<Project, "name" | "stack">;
};

/* ── Explanation cards (same structure in both modes) ─────────────────────── */

export function FindingExplanation({ finding, rule, mode, project }: FindingProps) {
  const dev = mode === "developer";
  return (
    // Keyed on mode so the swapped content fades in instead of jumping.
    <div key={mode} className="space-y-6 motion-safe:animate-fade-in">
      <Card>
        <SectionHeader icon={dev ? <Code2 size={16} className="text-primary" /> : undefined} title={dev ? "Technical details" : "What happened?"} />
        <div className="space-y-5 p-5">
          {dev && <TechnicalFacts finding={finding} rule={rule} />}
          <p className="leading-relaxed">
            <RichText text={dev ? rule.technical : rule.simple} />
          </p>
        </div>
      </Card>

      <Card className="border-high/30">
        <div className="flex gap-3 p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-high" />
          <div className="min-w-0 flex-1 space-y-4">
            {dev ? (
              <>
                <Disclosure title="Root cause" defaultOpen>
                  <RichText text={rule.rootCause} />
                </Disclosure>
                <Disclosure title="Attack scenario">
                  <RichText text={rule.attackScenario} />
                </Disclosure>
                <Disclosure title="Impact">{rule.whyItMatters}</Disclosure>
              </>
            ) : (
              <>
                <div>
                  <h3 className="font-semibold">Why does it matter?</h3>
                  <p className="mt-1 leading-relaxed text-muted">{rule.whyItMatters}</p>
                </div>
                <div>
                  <h3 className="font-semibold">What could happen to my app?</h3>
                  <p className="mt-1 leading-relaxed text-muted">{rule.impact}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<Wrench size={16} className="text-primary" />} title={dev ? "Remediation" : "What should I do?"} />
        <div className="space-y-5 p-5">
          <ol className="space-y-3">
            {(dev ? rule.remediation : rule.steps).map((s, i) => (
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
          {rule.ai.manual && (
            <div className="rounded-lg border border-high/30 bg-high/5 p-3 text-sm">
              <p className="font-medium">{dev ? "Out-of-band steps (not code changes)" : "Things only you can do"}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                {rule.ai.manual.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <CodeTabs examples={rule.examples} />
        </div>
      </Card>

      <AiFixAssistant finding={finding} rule={rule} mode={mode} project={project} />
    </div>
  );
}

function TechnicalFacts({ finding, rule }: { finding: Finding; rule: Rule }) {
  const analyzer = analyzerInfo(finding.analyzer);
  const advisories = advisoryRefs(finding.evidence);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Vulnerability", value: rule.technicalTitle },
    { label: "Rule ID", value: <code className="font-mono text-[0.85em]">{rule.id}</code> },
    { label: "Category", value: rule.category },
    { label: "Severity", value: <SeverityBadge severity={finding.severity} /> },
    {
      label: "Detected by",
      value: (
        <>
          {analyzer.name}
          <span className="block text-xs text-muted">{analyzer.method}</span>
        </>
      ),
    },
    ...affectedResources(finding).map((r) => ({
      label: r.label,
      value: <span className="break-all font-mono text-[0.85em]">{r.value}</span>,
    })),
    {
      label: "CWE",
      value: <RefList refs={rule.cwe.map((c) => ({ id: c.id, href: cweHref(c), title: c.name }))} />,
    },
  ];
  if (advisories.length) rows.push({ label: "Advisories", value: <RefList refs={advisories} /> });

  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-lg border bg-surface-2/50 p-4 text-sm sm:grid-cols-[120px_1fr]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted sm:pt-0.5">{r.label}</dt>
          <dd className="min-w-0">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RefList({ refs }: { refs: { id: string; href: string; title?: string }[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {refs.map((r) => (
        <a key={r.id} href={r.href} target="_blank" rel="noreferrer" title={r.title} className="font-mono text-[0.85em] text-primary hover:underline">
          {r.id}
          {r.title && <span className="ml-1 font-sans text-muted">{r.title}</span>}
        </a>
      ))}
    </span>
  );
}

/* ── AI Fix Assistant ─────────────────────────────────────────────────────── */

export function AiFixAssistant({ finding, rule, mode, project }: FindingProps) {
  const prompt = useMemo(() => buildFixPrompt({ finding, rule, mode, project }), [finding, rule, mode, project]);
  return (
    <Card>
      <PromptPanel
        title="AI Fix Assistant"
        description={
          mode === "developer"
            ? "Technical prompt with evidence, constraints and verification requirements."
            : "Easy instructions to paste into Cursor, Lovable, Bolt or any AI coding assistant."
        }
        prompt={prompt}
        footnote="Secrets are never included. Review every change the assistant makes. WebGuard only marks this issue fixed after a re-scan confirms it is gone."
      />
    </Card>
  );
}

/** Prompt preview with a Copy Instructions button. Shared by single-issue and fix-all prompts. */
export function PromptPanel({ title, description, prompt, footnote }: { title: string; description: string; prompt: string; footnote: string }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Instructions copied", { description: "Paste them into Cursor, Lovable, Bolt or your AI coding assistant." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context): select the text for a manual copy.
      const sel = window.getSelection();
      if (preRef.current && sel) sel.selectAllChildren(preRef.current);
      toast.error("Couldn’t copy automatically", { description: "The instructions are selected. Press Ctrl+C (or ⌘C) to copy them." });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <Wand2 size={16} className="text-primary" /> {title}
          </h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <Button size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
          {copied ? "Copied" : "Copy Instructions"}
        </Button>
      </div>
      <div className="space-y-3 p-5">
        <pre
          ref={preRef}
          tabIndex={0}
          aria-label="AI fix instructions"
          className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed"
        >
          {prompt}
        </pre>
        <p className="flex items-start gap-2 text-xs text-muted">
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          {footnote}
        </p>
      </div>
    </>
  );
}

/* ── Evidence ─────────────────────────────────────────────────────────────── */

export function EvidenceCard({ finding, mode }: { finding: Finding; mode: ExplanationMode }) {
  const block = <CodeBlock code={finding.evidence} lang={finding.evidenceLang} />;
  return (
    <Card>
      <div className="border-b px-5 py-3">
        <h3 className="font-semibold">Evidence</h3>
        <p className="text-xs text-muted">
          {mode === "developer" ? `Recorded by ${analyzerInfo(finding.analyzer).name}` : "What WebGuard observed"}
        </p>
      </div>
      <div className="p-4">
        {mode === "developer" ? (
          block
        ) : (
          <details className="group">
            <summary className="cursor-pointer select-none text-sm text-primary hover:underline">Show the technical evidence</summary>
            <div className="mt-3">{block}</div>
          </details>
        )}
        <p className="mt-2 text-xs text-muted">Secret values are redacted. WebGuard never stores full keys.</p>
      </div>
    </Card>
  );
}

/* ── Verification ─────────────────────────────────────────────────────────── */

const VERIFICATION_STYLE: Record<VerificationKind, { cls: string; Icon: React.ComponentType<{ size?: number }> }> = {
  resolved: { cls: "border-ok/30 bg-ok/12 text-ok", Icon: CheckCircle2 },
  still_present: { cls: "border-high/30 bg-high/12 text-high", Icon: CircleDot },
  regressed: { cls: "border-critical/30 bg-critical/12 text-critical", Icon: RotateCcw },
  new: { cls: "border-medium/30 bg-medium/12 text-medium", Icon: Sparkles },
  manual_review: { cls: "border-border bg-surface-2 text-muted", Icon: HelpCircle },
};

export function VerificationBadge({ state, className }: { state: VerificationState; className?: string }) {
  const { cls, Icon } = VERIFICATION_STYLE[state.kind];
  return (
    <Badge className={cn("font-semibold", cls, className)} title={verificationDescription(state)}>
      <Icon size={12} />
      {VERIFICATION_LABEL[state.kind]}
    </Badge>
  );
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b px-5 py-3">
      {icon}
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}

function Disclosure({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="cursor-pointer select-none font-semibold marker:text-muted">{title}</summary>
      <p className="mt-1 leading-relaxed text-muted">{children}</p>
    </details>
  );
}

/** Renders `inline code` segments. */
export function RichText({ text }: { text: string }) {
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
