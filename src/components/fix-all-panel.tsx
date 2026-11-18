"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { buildFixAllPrompt, groupOpenFindings } from "@/lib/fix-prompt";
import { RULES_BY_ID } from "@/lib/rules";
import type { ExplanationMode, Finding, Project } from "@/lib/types";
import { Card } from "./ui";
import { PromptPanel } from "./finding-explainer";

/** Above this, many assistants start skipping parts of a prompt; suggest smaller batches. */
export const LONG_PROMPT_CHARS = 15_000;

/**
 * One prompt for every open finding in `findings` (already filtered by the
 * page). Ignored and resolved findings are never included.
 */
export function FixAllPanel({
  findings,
  mode,
  project,
  filtered,
}: {
  findings: Finding[];
  mode: ExplanationMode;
  project?: Pick<Project, "name" | "stack">;
  /** True when the page's filters narrow the list, so the copy says so. */
  filtered: boolean;
}) {
  const groups = useMemo(() => groupOpenFindings(findings, RULES_BY_ID), [findings]);
  const prompt = useMemo(() => buildFixAllPrompt({ findings, rulesById: RULES_BY_ID, mode, project }), [findings, mode, project]);
  const count = groups.reduce((n, g) => n + g.findings.length, 0);

  if (count === 0) {
    return (
      <Card className="p-5 text-sm text-muted">
        No open issues {filtered ? "match your filters" : "to fix"}. Ignored and resolved issues are never included.
      </Card>
    );
  }

  return (
    <Card>
      <PromptPanel
        title="Fix all with AI"
        description={`${count} open issue${count === 1 ? "" : "s"} in ${groups.length} group${groups.length === 1 ? "" : "s"}${filtered ? " matching your filters" : ""}, most serious first. Paste into Cursor, Lovable, Bolt or any AI coding assistant.`}
        prompt={prompt}
        footnote="Secrets are never included. The assistant is asked to fix one issue at a time and check the app still works between fixes. Review every change. Issues are only marked fixed after a re-scan confirms it."
      />
      {prompt.length > LONG_PROMPT_CHARS && (
        <p className="flex items-start gap-2 border-t px-5 py-3 text-xs text-medium">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          This is a long prompt. If your assistant skips parts of it, filter by severity or category above and fix in smaller batches.
        </p>
      )}
    </Card>
  );
}
