import { createHash } from "node:crypto";
import type { Severity } from "@/lib/types";

/**
 * High-confidence secret patterns only: we would rather miss an exotic key
 * format than drown a vibe coder in false positives.
 */
interface SecretPattern {
  id: string;
  label: string;
  re: RegExp;
  severity: Severity;
}

const PATTERNS: SecretPattern[] = [
  { id: "stripe-live", label: "Stripe live secret key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, severity: "critical" },
  { id: "stripe-test", label: "Stripe test secret key", re: /\bsk_test_[0-9a-zA-Z]{20,}\b/g, severity: "low" },
  { id: "openai", label: "OpenAI API key", re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}\b|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g, severity: "critical" },
  { id: "anthropic", label: "Anthropic API key", re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g, severity: "critical" },
  { id: "aws-access-key", label: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "high" },
  { id: "github-token", label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, severity: "critical" },
  { id: "slack-token", label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: "high" },
  { id: "sendgrid", label: "SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, severity: "high" },
  { id: "private-key", label: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, severity: "critical" },
];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const SUPABASE_SECRET_RE = /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g;
const PLACEHOLDER_RE = /x{6,}|your[_-]?(?:api[_-]?)?key|example|placeholder|dummy|<[^>]+>|\.\.\./i;

export type SecretKind = "generic" | "supabase-service-role";

export interface SecretMatch {
  kind: SecretKind;
  label: string;
  severity: Severity;
  hash: string;
  redacted: string;
  line: number;
  /** The source line with the secret replaced by its redacted form. */
  context: string;
}

export function redact(secret: string): string {
  if (secret.startsWith("-----BEGIN")) return secret + " [key body redacted]";
  const head = secret.slice(0, Math.min(10, Math.floor(secret.length / 3)));
  return `${head}…[redacted ${secret.length} chars]`;
}

export function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function lineAt(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const endIdx = text.indexOf("\n", index);
  const end = endIdx === -1 ? text.length : endIdx;
  return { line, start, end };
}

function contextFor(text: string, index: number, secret: string) {
  const { line, start, end } = lineAt(text, index);
  let ctx = text.slice(start, end).replace(secret, redact(secret));
  // Minified bundles have enormous "lines"; show a window around the match.
  if (ctx.length > 220) {
    const at = index - start;
    ctx = "…" + text.slice(Math.max(start, start + at - 80), Math.min(end, start + at + 40)).replace(secret, redact(secret)) + "…";
  }
  return { line, context: ctx.trim() };
}

/** Find secrets in a text blob. Also returns Supabase anon-key/project hints. */
export function scanText(text: string): { matches: SecretMatch[]; supabaseAnon: boolean } {
  const matches: SecretMatch[] = [];
  const seen = new Set<string>();
  let supabaseAnon = false;

  const push = (kind: SecretKind, label: string, severity: Severity, secret: string, index: number) => {
    if (seen.has(secret) || PLACEHOLDER_RE.test(secret)) return;
    seen.add(secret);
    const { line, context } = contextFor(text, index, secret);
    matches.push({ kind, label, severity, hash: sha(secret), redacted: redact(secret), line, context });
  };

  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) push("generic", p.label, p.severity, m[0], m.index!);
  }
  for (const m of text.matchAll(SUPABASE_SECRET_RE)) {
    push("supabase-service-role", "Supabase secret key (sb_secret_)", "critical", m[0], m.index!);
  }
  for (const m of text.matchAll(JWT_RE)) {
    const payload = decodeJwtPayload(m[0]);
    if (!payload) continue;
    if (payload.role === "service_role") {
      push("supabase-service-role", "Supabase service_role JWT", "critical", m[0], m.index!);
    } else if (payload.role === "anon" && String(payload.iss).startsWith("supabase")) {
      supabaseAnon = true;
    }
  }
  return { matches, supabaseAnon };
}
