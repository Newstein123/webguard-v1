import "server-only";
import type { AnalyzerResult, RawFinding } from "../types";
import { safeFetch, type SafeResponse } from "../http";
import { scanText } from "../secrets";

/**
 * Passive live-site checks: a GET of the page and its own JavaScript files,
 * exactly what any visitor's browser downloads. No probing of hidden paths;
 * those active checks require domain verification (post-MVP).
 */
export const HEADERS_ID = "site-headers";
export const BUNDLE_ID = "site-bundle";

const MAX_SCRIPTS = 25;

export async function fetchSite(url: string): Promise<SafeResponse> {
  const res = await safeFetch(url, { maxBytes: 3_000_000 });
  if (res.status >= 400) throw new Error(`The site responded with HTTP ${res.status}`);
  return res;
}

export function analyzeHeaders(page: SafeResponse): AnalyzerResult {
  const h = page.headers;
  const https = page.url.startsWith("https://");
  const csp = h.get("content-security-policy");
  const checks: { header: string; ok: boolean; important: boolean }[] = [
    { header: "Strict-Transport-Security", ok: !https ? false : !!h.get("strict-transport-security"), important: true },
    { header: "Content-Security-Policy", ok: !!csp, important: true },
    { header: "X-Frame-Options (or CSP frame-ancestors)", ok: !!h.get("x-frame-options") || /frame-ancestors/i.test(csp ?? ""), important: false },
    { header: "X-Content-Type-Options", ok: (h.get("x-content-type-options") ?? "").toLowerCase() === "nosniff", important: false },
    { header: "Referrer-Policy", ok: !!h.get("referrer-policy"), important: false },
  ];
  const missing = checks.filter((c) => !c.ok);
  const origin = new URL(page.url).origin;
  const findings: RawFinding[] = [];
  if (!https) {
    findings.push({
      ruleId: "missing-security-headers",
      severity: "high",
      fingerprint: `${HEADERS_ID}:${origin}:no-https`,
      location: origin,
      evidence: `GET ${page.url}\n→ final page is served over plain HTTP (no TLS).`,
      evidenceLang: "http",
    });
  }
  if (missing.length) {
    findings.push({
      ruleId: "missing-security-headers",
      severity: missing.some((m) => m.important) ? "medium" : "low",
      fingerprint: `${HEADERS_ID}:${origin}`,
      location: `${origin}/`,
      evidence: [`GET ${page.url} → ${page.status}`, ...checks.map((c) => `${c.ok ? "✓ present" : "✗ missing"}  ${c.header}`)].join("\n"),
      evidenceLang: "http",
    });
  }
  const stackHints: string[] = [];
  if (h.get("x-vercel-id") || /vercel/i.test(h.get("server") ?? "")) stackHints.push("Vercel");
  if (h.get("x-nf-request-id") || /netlify/i.test(h.get("server") ?? "")) stackHints.push("Netlify");
  if (/\/_next\//.test(page.body)) stackHints.push("Next.js", "React");
  if (/lovable/i.test(new URL(page.url).hostname)) stackHints.push("Lovable");
  return { covered: [HEADERS_ID], findings, stackHints };
}

function scriptUrls(page: SafeResponse): string[] {
  const base = new URL(page.url);
  const urls = new Set<string>();
  for (const m of page.body.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      // Only the site's own code; third-party CDNs are out of scope.
      if (u.hostname === base.hostname || u.hostname.endsWith(`.${base.hostname}`)) urls.add(u.toString());
    } catch {}
  }
  for (const m of page.body.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname) urls.add(u.toString());
    } catch {}
  }
  return [...urls].slice(0, MAX_SCRIPTS);
}

export async function analyzeBundles(page: SafeResponse): Promise<AnalyzerResult> {
  const sources: { location: string; text: string }[] = [{ location: new URL(page.url).pathname || "/", text: page.body }];
  for (const url of scriptUrls(page)) {
    try {
      const res = await safeFetch(url, { maxBytes: 8_000_000, timeoutMs: 15_000 });
      if (res.status < 400) sources.push({ location: new URL(url).pathname, text: res.body });
    } catch {
      // A missing chunk shouldn't fail the whole scan.
    }
  }

  const findings: RawFinding[] = [];
  const stackHints: string[] = [];
  for (const src of sources) {
    const { matches, supabaseAnon } = scanText(src.text);
    if (supabaseAnon || /\.supabase\.co\b/.test(src.text)) stackHints.push("Supabase");
    if (/firebaseio\.com|firebaseapp\.com/.test(src.text)) stackHints.push("Firebase");
    for (const m of matches) {
      const serviceRole = m.kind === "supabase-service-role";
      findings.push({
        ruleId: serviceRole ? "supabase-service-role-exposed" : "hardcoded-secret",
        severity: serviceRole ? "critical" : m.severity === "low" ? "medium" : m.severity,
        fingerprint: `${BUNDLE_ID}:${m.hash}`,
        location: `${new URL(page.url).origin}${src.location}`,
        evidence: `// ${m.label} shipped to every visitor's browser (${m.redacted})\n${m.context}`,
        evidenceLang: "js",
      });
    }
  }
  return { covered: [BUNDLE_ID], findings, stackHints };
}
