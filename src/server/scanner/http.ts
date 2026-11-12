import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound HTTP for scanning user-supplied targets.
 *
 * SSRF guard: only http(s), only public IPs (checked after DNS resolution and
 * again on every redirect hop), bounded time and body size. There is still a
 * small DNS-rebinding window between our lookup and fetch's own lookup; the
 * production worker should run with network egress rules that block private
 * ranges as a second layer.
 */

const USER_AGENT = "WebGuardScanner/0.1 (+passive security checks)";
const ALLOW_PRIVATE = process.env.SCANNER_ALLOW_PRIVATE_TARGETS === "true";

export class ScanHttpError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanHttpError("Not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ScanHttpError("Only http and https URLs can be scanned");
  if (url.username || url.password) throw new ScanHttpError("URLs with credentials are not allowed");
  if (ALLOW_PRIVATE) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new ScanHttpError("Private or local addresses cannot be scanned");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new ScanHttpError(`Could not resolve ${host}`);
  });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new ScanHttpError("Private or local addresses cannot be scanned");
  }
  return url;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  truncated: boolean;
}

export async function safeFetch(
  raw: string,
  { maxBytes = 2_000_000, timeoutMs = 10_000, maxRedirects = 5 }: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<SafeResponse> {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((e: Error) => {
      throw new ScanHttpError(e.name === "TimeoutError" ? `Timed out fetching ${url.host}` : `Could not connect to ${url.host}`);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      await res.body?.cancel();
      continue;
    }
    const { text, truncated } = await readCapped(res, maxBytes);
    return { url: url.toString(), status: res.status, headers: res.headers, body: text, truncated };
  }
  throw new ScanHttpError("Too many redirects");
}

async function readCapped(res: Response, maxBytes: number) {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      truncated = true;
      chunks.push(value.subarray(0, value.byteLength - (size - maxBytes)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}
