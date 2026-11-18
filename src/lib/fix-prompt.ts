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
import type { ExplanationMode, Finding, Project, Rule, Severity } from "./types";

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
  const location = locationLine(finding);
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

/* ── All open issues in one prompt ───────────────────────────────────────── */

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
/** Evidence blocks shown per issue type in Developer Mode; the rest are listed by location only. */
const MAX_EVIDENCE_PER_GROUP = 3;
const MAX_EVIDENCE_LINES = 15;

type BatchFinding = FixPromptInput["finding"] & Pick<Finding, "status">;

export interface FixAllPromptInput {
  findings: BatchFinding[];
  rulesById: Record<string, Rule | undefined>;
  mode: ExplanationMode;
  project?: Pick<Project, "name" | "stack">;
}

const BATCH_CONSTRAINTS = {
  normal: [
    "Fix the issues one at a time, in the order below (most serious first). After each one, check the app still works before moving on.",
    "Keep everything else in my app working exactly as it does now. Make the smallest change that fixes each issue.",
    "Never write passwords, API keys or tokens into the code. If something needs a key, read it from an environment variable and tell me the variable name to set.",
    "Don’t delete data or remove features to make a warning go away.",
    "If a fix needs a decision from me, stop and ask instead of guessing.",
    "When you’re done, list what you changed for each issue in simple words, and anything I need to do myself.",
  ],
  developer: [
    "Work through the findings in the order given (highest severity first). Keep each fix a separate, reviewable change; do not mix unrelated refactors in.",
    "Preserve existing behaviour and public interfaces; keep each diff minimal and scoped to its finding.",
    "Do not introduce credentials, tokens or keys into source, config, comments, tests or your response. Reference env var names only.",
    "Do not weaken other security controls (auth checks, RLS, validation) or suppress the scanner instead of fixing the root cause.",
    "Follow the project’s existing conventions, libraries and file layout.",
    "If a fix requires a decision you cannot make from the code (e.g. a missing ownership column), stop and ask.",
    "Finish with a summary per finding: touched files, behaviour change, and any manual or deployment steps.",
  ],
};

/** Open findings grouped by rule, most severe group first. */
export function groupOpenFindings<F extends BatchFinding>(findings: F[], rulesById: FixAllPromptInput["rulesById"]) {
  const groups = new Map<string, { rule: Rule; findings: F[] }>();
  for (const f of findings) {
    const rule = rulesById[f.ruleId];
    if (f.status !== "open" || !rule) continue;
    const g = groups.get(rule.id) ?? { rule, findings: [] };
    g.findings.push(f);
    groups.set(rule.id, g);
  }
  const worst = (g: { findings: F[] }) => Math.min(...g.findings.map((f) => SEVERITY_RANK[f.severity]));
  return [...groups.values()]
    .map((g) => ({ ...g, findings: [...g.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) }))
    .sort((a, b) => worst(a) - worst(b) || b.findings.length - a.findings.length);
}

/**
 * One prompt that fixes every open finding passed in, grouped by issue type.
 * Shared rules, manual steps and checks are stated once.
 */
export function buildFixAllPrompt({ findings, rulesById, mode, project }: FixAllPromptInput): string {
  const groups = groupOpenFindings(findings, rulesById);
  const total = groups.reduce((n, g) => n + g.findings.length, 0);
  if (total === 0) return "";
  const stack = project?.stack.length ? project.stack.join(", ") : undefined;
  const dev = mode === "developer";
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const uniq = (items: string[]) => [...new Set(items)];

  const sections = groups.map(({ rule, findings: fs }, i) => {
    const sev = fs[0].severity;
    const heading = `## ${i + 1}. ${dev ? rule.technicalTitle : rule.title} (${sev}${fs.length > 1 ? `, ${fs.length} places` : ""})`;
    const where = list(fs.map(locationLine));
    const ruleConstraints = rule.ai.constraints?.length ? `\n\n${dev ? "Constraints" : "Rules for this fix"}:\n${list(rule.ai.constraints)}` : "";
    if (!dev) {
      return `${heading}\n${stripTicks(rule.simple)}\n\nWhere:\n${where}\n\nWhat to change: ${rule.ai.goal}${ruleConstraints}`;
    }
    const refs = uniq([...rule.cwe.map((c) => c.id), ...fs.flatMap((f) => advisoryRefs(f.evidence).map((a) => a.id))]);
    const shown = fs.slice(0, MAX_EVIDENCE_PER_GROUP);
    const evidence = shown
      .map((f) => {
        const lines = sanitizeForPrompt(f.evidence).split("\n");
        const body = lines.slice(0, MAX_EVIDENCE_LINES).join("\n") + (lines.length > MAX_EVIDENCE_LINES ? "\n…" : "");
        return `${sanitizeForPrompt(f.location)}:\n\`\`\`${f.evidenceLang ?? ""}\n${body}\n\`\`\``;
      })
      .join("\n");
    const more = fs.length > shown.length ? `\n(Evidence shown for ${shown.length} of ${fs.length}; the same pattern applies to every location listed above.)` : "";
    return [
      heading,
      `Rule: ${rule.id} · Category: ${rule.category} · Detected by: ${analyzerInfo(fs[0].analyzer).name}${refs.length ? ` · References: ${refs.join(", ")}` : ""}`,
      `Locations:\n${where}`,
      `Evidence (secrets redacted):\n${evidence}${more}`,
      `Root cause: ${rule.rootCause}`,
      `Required changes:\n${list(rule.remediation, true)}`,
      `Expected behaviour after the fix:\n${list(rule.ai.expected)}${ruleConstraints}`,
    ].join("\n\n");
  });

  const manual = uniq(groups.flatMap((g) => g.rule.ai.manual ?? []));
  // Per-rule "re-scan" reminders collapse into the single closing line below.
  const checks = uniq(groups.flatMap((g) => (dev ? g.rule.ai.tests.technical : g.rule.ai.tests.simple.map(stripTicks)))).filter(
    (c) => !/WebGuard re-scan/i.test(c),
  );
  const intro = dev
    ? `Fix the following ${plural(total, "security finding")} (${plural(groups.length, "issue type")}) reported by WebGuard${stack ? ` in a ${stack} project` : ""}. Treat each as a security fix: correct the root cause, not just the symptom.`
    : `A security scanner (WebGuard) found ${plural(total, "problem")} in my app${stack ? ` (built with ${stack})` : ""}, grouped into ${plural(groups.length, "type")} of issue below. Please help me fix them.`;

  return [
    intro,
    `## ${dev ? "Constraints for all changes" : "Rules for all changes"}\n${list(BATCH_CONSTRAINTS[mode])}`,
    ...sections,
    manual.length
      ? `## ${dev ? "Out-of-band steps (list these for the developer; you cannot perform them)" : "Remind me to do these myself (you can’t do them for me)"}\n${list(manual)}`
      : "",
    `## ${dev ? "Verification" : "How to check everything worked"}\n${dev ? "Add or update automated tests where the project has a test setup, and confirm:\n" : ""}${list([
      ...checks,
      dev
        ? "A WebGuard re-scan no longer reports these findings (the developer will run it after deploying/pushing)."
        : "After the changes are deployed or pushed, I will run a WebGuard re-scan to confirm the issues are gone.",
    ])}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Where a finding is, as one line. Dependency findings also carry the patched
 * version from the scanner's evidence, which the AI needs to make the fix.
 */
function locationLine(f: Pick<Finding, "location" | "evidence" | "analyzer">): string {
  const where = sanitizeForPrompt(f.location);
  if (f.analyzer === "deps") {
    const fix = f.evidence.match(/^fix:\s+(.+)$/m)?.[1];
    if (fix) return `${where} (${fix})`;
  }
  return where;
}

/** Normal Mode prompts read as plain prose; drop markdown code ticks from rule text. */
function stripTicks(s: string) {
  return s.replace(/`([^`]+)`/g, "$1");
}
