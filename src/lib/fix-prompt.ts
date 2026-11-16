/**
 * Copy-paste instructions for AI coding assistants (Cursor, Lovable, Bolt, …).
 *
 * Built deterministically from the rule knowledge base and the scanner's own
 * finding data. No LLM is involved, so nothing is invented: the prompt only
 * contains what the scanner recorded and what the rule documents.
 *
 * Evidence is already redacted before storage; sanitizeForPrompt() is a second
 * layer that strips anything secret-shaped, including the short prefixes kept
 * by the scanner's redaction, so prompts never carry credential material.
 */
import { JWT_RE, SECRET_PATTERNS, SUPABASE_SECRET_RE } from "./secret-patterns";
import { advisoryRefs, affectedResources, analyzerInfo } from "./finding-details";
import type { ExplanationMode, Finding, Project, Rule } from "./types";

const REDACTED = "[REDACTED]";

/** Output of the scanner's redact(): `<prefix>…[redacted N chars]`. */
const SCANNER_REDACTION_RE = /[A-Za-z0-9_\-.+/=]*…\[redacted \d+ chars\]/g;
/** PEM blocks, with or without a body. */
const PEM_RE = /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|\[key body redacted\])/g;
/** Values of KEY=value / KEY: value pairs whose name looks secret. */
const SECRET_ASSIGNMENT_RE =
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|ACCESS_?KEY|SERVICE_ROLE)[A-Z0-9_]*)(\s*[:=]\s*)(["']?)(?!<redacted>|\[REDACTED\]|process\.env|import\.meta\.env|Deno\.env)([^\s"'`,;]{6,})\3/gi;

export function sanitizeForPrompt(text: string): string {
  let out = text.replace(PEM_RE, `${REDACTED} private key`).replace(SCANNER_REDACTION_RE, REDACTED);
  for (const p of SECRET_PATTERNS) out = out.replace(p.re, REDACTED);
  out = out.replace(JWT_RE, REDACTED).replace(SUPABASE_SECRET_RE, REDACTED);
  out = out.replace(SECRET_ASSIGNMENT_RE, (_m, name: string, sep: string, q: string) => `${name}${sep}${q}${REDACTED}${q}`);
  return out;
}

export interface FixPromptInput {
  finding: Pick<Finding, "ruleId" | "severity" | "location" | "evidence" | "evidenceLang" | "analyzer">;
  rule: Rule;
  mode: ExplanationMode;
  project?: Pick<Project, "name" | "stack">;
}

const GENERIC_CONSTRAINTS = {
  normal: [
    "Keep everything else in my app working exactly as it does now. Make the smallest change that fixes this issue.",
    "Never write passwords, API keys or tokens into the code. If something needs a key, read it from an environment variable and tell me the variable name to set.",
    "Don’t delete data or remove features to make the warning go away.",
    "When you’re done, explain in simple words what you changed and anything I need to do myself.",
  ],
  developer: [
    "Preserve existing behaviour and public interfaces; keep the diff minimal and scoped to this finding.",
    "Do not introduce credentials, tokens or keys into source, config, comments, tests or your response. Reference env var names only.",
    "Do not weaken other security controls (auth checks, RLS, validation) or suppress the scanner instead of fixing the root cause.",
    "Follow the project’s existing conventions, libraries and file layout.",
    "Summarise the change, list touched files, and call out any manual or deployment steps.",
  ],
};

const list = (items: string[], ordered = false) => items.map((s, i) => `${ordered ? `${i + 1}.` : "-"} ${s}`).join("\n");

export function buildFixPrompt({ finding, rule, mode, project }: FixPromptInput): string {
  const location = sanitizeForPrompt(finding.location);
  const stack = project?.stack.length ? project.stack.join(", ") : undefined;
  const manual = rule.ai.manual ?? [];
  const constraints = [...GENERIC_CONSTRAINTS[mode], ...(rule.ai.constraints ?? [])];

  if (mode === "normal") {
    return [
      `A security scanner (WebGuard) found a problem in my app${stack ? ` (built with ${stack})` : ""}. Please help me fix it.`,
      `## The problem\n${rule.title}\n\n${stripTicks(rule.simple)}`,
      `## Where it is\n${location}`,
      `## What to change\n${rule.ai.goal}`,
      `## Rules for this change\n${list(constraints)}`,
      manual.length ? `## Remind me to do these myself (you can’t do them for me)\n${list(manual)}` : "",
      `## How to check it worked\n${list([...rule.ai.tests.simple.map(stripTicks), "After the change is deployed or pushed, I will run a WebGuard re-scan to confirm the issue is gone."])}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const analyzer = analyzerInfo(finding.analyzer);
  const resources = affectedResources(finding).map((r) => `${r.label}: ${sanitizeForPrompt(r.value)}`);
  const advisories = advisoryRefs(finding.evidence).map((a) => a.id);
  const refs = [...rule.cwe.map((c) => `${c.id} (${c.name})`), ...advisories];
  const evidence = sanitizeForPrompt(finding.evidence);

  return [
    `Fix the following security finding reported by WebGuard. Treat it as a security fix: correct the root cause, not just the symptom.`,
    `## Finding\n${list([
      `Rule: ${rule.id}`,
      `Title: ${rule.technicalTitle}`,
      `Category: ${rule.category}`,
      `Severity: ${finding.severity}`,
      `Detected by: ${analyzer.name} (${analyzer.method})`,
      ...(refs.length ? [`References: ${refs.join(", ")}`] : []),
      ...(stack ? [`Project stack: ${stack}`] : []),
    ])}`,
    `## Affected resources\n${list(resources)}`,
    `## Evidence (secrets redacted)\n\`\`\`${finding.evidenceLang ?? ""}\n${evidence}\n\`\`\``,
    `## Root cause\n${rule.rootCause}`,
    `## Attack scenario\n${rule.attackScenario}`,
    `## Required changes\n${list(rule.remediation, true)}`,
    `## Expected security behaviour after the fix\n${list(rule.ai.expected)}`,
    `## Constraints\n${list(constraints)}`,
    manual.length ? `## Out-of-band steps (list these for the developer; you cannot perform them)\n${list(manual)}` : "",
    `## Verification\nAdd or update automated tests where the project has a test setup, and confirm:\n${list([...rule.ai.tests.technical, "A WebGuard re-scan no longer reports this finding (the developer will run it after deploying/pushing)."])}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Normal Mode prompts read as plain prose; drop markdown code ticks from rule text. */
function stripTicks(s: string) {
  return s.replace(/`([^`]+)`/g, "$1");
}
