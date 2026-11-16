import { createHash } from "node:crypto";
import { JWT_RE, SECRET_PATTERNS as PATTERNS, SUPABASE_SECRET_RE } from "@/lib/secret-patterns";
import type { Severity } from "@/lib/types";

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
