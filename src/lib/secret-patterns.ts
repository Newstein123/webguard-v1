import type { Severity } from "./types";

/**
 * High-confidence secret patterns only: we would rather miss an exotic key
 * format than drown a vibe coder in false positives.
 */
export interface SecretPattern {
  id: string;
  label: string;
  re: RegExp;
  severity: Severity;
}

export const SECRET_PATTERNS: SecretPattern[] = [
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

export const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
export const SUPABASE_SECRET_RE = /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g;
