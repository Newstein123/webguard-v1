/**
 * Lockfile parsers for the npm ecosystem: package-lock.json, pnpm-lock.yaml,
 * yarn.lock (v1 and Berry) and bun.lock. Each returns the installed packages
 * (name, exact version, whether it is a dev dependency when the format says so).
 *
 * Only registry packages with a plain semver version are returned: workspace,
 * git, link and file dependencies are skipped, because OSV cannot match them.
 * Parsers are line-based or JSON, never `eval`, and tolerate unknown keys.
 */

export interface Pkg {
  name: string;
  version: string;
  dev: boolean;
  lockfile: string;
}

export type LockfileKind = "npm" | "pnpm" | "yarn" | "bun";

/** Lockfiles we can read, by file name. bun.lockb (binary) is deliberately absent. */
export const LOCKFILE_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$/;

export function lockfileKind(path: string): LockfileKind | null {
  const name = path.split("/").pop();
  return name === "package-lock.json" ? "npm" : name === "pnpm-lock.yaml" ? "pnpm" : name === "yarn.lock" ? "yarn" : name === "bun.lock" ? "bun" : null;
}

export function parseLockfile(path: string, content: string): Pkg[] {
  switch (lockfileKind(path)) {
    case "npm":
      return parsePackageLock(content, path);
    case "pnpm":
      return parsePnpmLock(content, path);
    case "yarn":
      return parseYarnLock(content, path);
    case "bun":
      return parseBunLock(content, path);
    default:
      return [];
  }
}

const isSemver = (v: string) => /^\d+\.\d+\.\d+/.test(v);

function collect(lockfile: string) {
  const out = new Map<string, Pkg>();
  return {
    add(name: string, version: string, dev = false) {
      if (!name || !isSemver(version)) return;
      const key = `${name}@${version}`;
      const prev = out.get(key);
      // A package counts as dev only if every occurrence is dev.
      out.set(key, { name, version, dev: prev ? prev.dev && dev : dev, lockfile });
    },
    list: () => [...out.values()],
  };
}

/** "name@1.2.3" or "@scope/name@1.2.3" → [name, version]. */
function splitAt(spec: string): [string, string] | null {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return null;
  return [spec.slice(0, at), spec.slice(at + 1)];
}

/* ── npm ─────────────────────────────────────────────────────────────────── */

/** package-lock.json v1/v2/v3. */
export function parsePackageLock(content: string, lockfile: string): Pkg[] {
  let json: { packages?: Record<string, { version?: string; dev?: boolean; link?: boolean }>; dependencies?: Record<string, unknown> };
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const c = collect(lockfile);
  if (json.packages) {
    for (const [key, info] of Object.entries(json.packages)) {
      if (!key || info.link || !info.version) continue;
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      c.add(name, info.version, !!info.dev);
    }
  } else if (json.dependencies) {
    const walk = (deps: Record<string, unknown>) => {
      for (const [name, raw] of Object.entries(deps)) {
        const d = raw as { version?: string; dev?: boolean; dependencies?: Record<string, unknown> };
        if (d.version) c.add(name, d.version, !!d.dev);
        if (d.dependencies) walk(d.dependencies);
      }
    };
    walk(json.dependencies);
  }
  return c.list();
}

/* ── pnpm ────────────────────────────────────────────────────────────────── */

/**
 * pnpm-lock.yaml v5, v6 and v9. Reads the top-level `packages:` section:
 *   v5: "  /axios/1.6.0:"            v6: "  /axios@1.6.0:" or "  /next@14.0.0(react@18.2.0):"
 *   v9: "  axios@1.6.0:"             (dev flags only exist in v5/v6: "    dev: true")
 */
export function parsePnpmLock(content: string, lockfile: string): Pkg[] {
  const c = collect(lockfile);
  // v5 keys are "/name/version"; v6+ are "name@version". The header says which.
  const major = Number(content.match(/^lockfileVersion:\s*['"]?(\d+)/m)?.[1] ?? 9);
  let inPackages = false;
  let current: { name: string; version: string } | null = null;
  let currentDev = false;
  const flush = () => {
    if (current) c.add(current.name, current.version, currentDev);
    current = null;
    currentDev = false;
  };

  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^\S/.test(line)) {
      flush();
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }
    if (!inPackages) continue;

    const key = line.match(/^ {2}(?!\s)['"]?(.+?)['"]?:\s*(\{\})?\s*$/);
    if (key) {
      flush();
      let spec = key[1].replace(/^\//, "").replace(/\(.*$/, ""); // drop leading "/" and peer suffix
      let parsed: [string, string] | null = null;
      if (major >= 6) parsed = splitAt(spec); // v6/v9: name@version
      else {
        // v5: name/version (version may carry a "_peerhash" suffix)
        spec = spec.replace(/_.*$/, "");
        const slash = spec.lastIndexOf("/");
        if (slash > 0) parsed = [spec.slice(0, slash), spec.slice(slash + 1)];
      }
      if (parsed) current = { name: parsed[0], version: parsed[1] };
      continue;
    }
    if (current && /^ {4}dev: true\s*$/.test(line)) currentDev = true;
  }
  flush();
  return c.list();
}

/* ── yarn ────────────────────────────────────────────────────────────────── */

/**
 * yarn.lock v1 and Berry (v2+). Each entry is an unindented descriptor list
 * followed by an indented `version "1.2.3"` (v1) or `version: 1.2.3` (Berry).
 */
export function parseYarnLock(content: string, lockfile: string): Pkg[] {
  const c = collect(lockfile);
  let name: string | null = null;
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\S/.test(line)) {
      // "@babel/core@^7.0.0", "@babel/core@^7.1.0":   or   "axios@npm:^1.6.0":
      const first = line.replace(/:\s*$/, "").split(",")[0].trim().replace(/^"|"$/g, "");
      name = first === "__metadata" ? null : (splitAt(first.replace(/@npm:.*$/, "@npm"))?.[0] ?? null);
      if (name && /@(workspace|link|portal|file|git|github|patch|exec):/.test(first)) name = null;
      continue;
    }
    const v = line.match(/^ {2}version:? "?([^"\s]+)"?\s*$/);
    if (v && name) {
      c.add(name, v[1]);
      name = null;
    }
  }
  return c.list();
}

/* ── bun ─────────────────────────────────────────────────────────────────── */

/**
 * bun.lock (text lockfile, Bun 1.2+): JSON with trailing commas.
 *   "packages": { "axios": ["axios@1.6.0", "", {...}, "sha512-..."], ... }
 */
export function parseBunLock(content: string, lockfile: string): Pkg[] {
  let json: { packages?: Record<string, unknown[]> };
  try {
    json = JSON.parse(stripJsonc(content));
  } catch {
    return [];
  }
  const c = collect(lockfile);
  for (const entry of Object.values(json.packages ?? {})) {
    const spec = Array.isArray(entry) && typeof entry[0] === "string" ? entry[0] : null;
    if (!spec || /@(workspace|link|file|git|github|root):/.test(spec)) continue;
    const parsed = splitAt(spec);
    if (parsed) c.add(parsed[0], parsed[1]);
  }
  return c.list();
}

/** Remove // and /* *\/ comments and trailing commas, outside of strings. */
function stripJsonc(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") out += s[++i] ?? "";
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (ch === "/" && s[i + 1] === "*") {
      i = s.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
    } else out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
