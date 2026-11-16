/**
 * Structured, technical views of a finding for Developer Mode.
 *
 * Everything here is derived from what the scanner stored (analyzer id,
 * location string, evidence). Nothing is inferred beyond that: if a value is
 * not present in the scanner output it is simply not returned.
 */
import type { CweRef, Finding } from "./types";
import { CHECKS_BY_ID, type CheckId } from "./coverage";

export interface AnalyzerInfo {
  id: string;
  name: string;
  /** How the analyzer detects issues. */
  method: string;
}

export function analyzerInfo(id: string): AnalyzerInfo {
  const def = CHECKS_BY_ID[id as CheckId];
  return def ? { id, name: def.name, method: def.method } : { id, name: id, method: "Not documented for this analyzer." };
}

export interface AffectedResource {
  label: "File" | "Line" | "Table" | "Policy" | "URL" | "Package" | "Version" | "Lockfile" | "Location";
  value: string;
}

/**
 * Split a finding's location into labelled parts, based on the formats the
 * analyzers write. Unknown formats are returned as a single "Location".
 */
export function affectedResources(finding: Pick<Finding, "analyzer" | "location">): AffectedResource[] {
  const loc = finding.location;
  let m: RegExpMatchArray | null;

  switch (finding.analyzer) {
    case "repo-secrets":
      if ((m = loc.match(/^(.+):(\d+)$/))) return [{ label: "File", value: m[1] }, { label: "Line", value: m[2] }];
      return [{ label: "File", value: loc }];
    case "deps":
      if ((m = loc.match(/^(.+?) → ((?:@[^/\s]+\/)?[^@\s]+)@(\S+)( \(dev\))?$/)))
        return [
          { label: "Package", value: m[2] + (m[4] ? " (dev dependency)" : "") },
          { label: "Version", value: m[3] },
          { label: "Lockfile", value: m[1] },
        ];
      break;
    case "rls":
      if ((m = loc.match(/^(.+?) → policy "(.+)" on (\S+)$/)))
        return [
          { label: "Table", value: m[3] },
          { label: "Policy", value: m[2] },
          { label: "File", value: m[1] },
        ];
      if ((m = loc.match(/^(.+?) → (\S+)$/))) return [{ label: "Table", value: m[2] }, { label: "File", value: m[1] }];
      break;
    case "site-headers":
    case "site-bundle":
      if (/^https?:\/\//.test(loc)) return [{ label: "URL", value: loc }];
      break;
  }
  return [{ label: "Location", value: loc }];
}

export interface AdvisoryRef {
  id: string;
  href: string;
}

const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/g;
const GHSA_RE = /\bGHSA(?:-[23456789cfghjmpqrvwx]{4}){3}\b/g;

/** CVE and GHSA identifiers that appear in the scanner's evidence (dependency findings). */
export function advisoryRefs(evidence: string): AdvisoryRef[] {
  const ids = new Set([...(evidence.match(CVE_RE) ?? []), ...(evidence.match(GHSA_RE) ?? [])]);
  return [...ids].map((id) => ({
    id,
    href: id.startsWith("CVE-") ? `https://nvd.nist.gov/vuln/detail/${id}` : `https://osv.dev/vulnerability/${id}`,
  }));
}

export function cweHref(cwe: CweRef): string {
  return `https://cwe.mitre.org/data/definitions/${cwe.id.replace(/^CWE-/, "")}.html`;
}
