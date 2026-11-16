import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeDependencies, osvRetry } from "../analyzers/dependencies";
import { buildCoverage, runCheck, scanWarning } from "../coverage";
import type { RepoSnapshot } from "../types";

const lock = JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/axios": { version: "1.6.0" } } });
const repo: RepoSnapshot = {
  owner: "o",
  repo: "r",
  ref: "main",
  commit: { sha: "abc", message: "m", author: "a" },
  files: [{ path: "package-lock.json", content: lock }],
  allPaths: ["package-lock.json"],
};
const advisory = {
  id: "GHSA-jr5f-v2jv-69x6",
  summary: "axios SSRF",
  aliases: ["CVE-2025-27152"],
  database_specific: { severity: "HIGH" },
  affected: [{ package: { name: "axios", ecosystem: "npm" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.8.2" }] }] }],
};
/** What undici throws for the timeout in the bug report. */
const connectTimeout = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let detailFailures: number;
let calls: string[];
beforeEach(() => {
  osvRetry.delaysMs = [1, 1];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/querybatch")) return json({ results: [{ vulns: [{ id: advisory.id }] }] });
      if (detailFailures-- > 0) throw connectTimeout();
      return json(advisory);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("dependency check against an unreliable OSV connection", () => {
  it("retries a transient connect timeout and still reports the vulnerability", async () => {
    detailFailures = 2;
    const r = await analyzeDependencies(repo);
    expect(r.covered).toEqual(["deps"]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].evidence).toContain("CVE-2025-27152");
    expect(calls.filter((u) => u.includes("/vulns/"))).toHaveLength(3);
  });

  it("skips (without claiming coverage) when OSV stays unreachable, instead of failing the scan", async () => {
    detailFailures = Infinity;
    const r = await analyzeDependencies(repo);
    expect(r).toMatchObject({ check: "deps", covered: [], findings: [], failed: true });
    expect(r.skipped).toContain("UND_ERR_CONNECT_TIMEOUT");
    expect(r.skipped).toContain("left unchanged");
    // Not covered → reconcile will not resolve existing dependency findings.
    expect(buildCoverage({ source: "github", url: null }, [r]).find((c) => c.check === "deps")).toMatchObject({ status: "skipped" });
    expect(scanWarning([r])).toMatch(/^Dependency audit skipped: Couldn't reach the OSV advisory database/);
  });

  it("does not silently drop an advisory that returns an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/querybatch") ? json({ results: [{ vulns: [{ id: advisory.id }] }] }) : json({}, 503))));
    const r = await analyzeDependencies(repo);
    expect(r.covered).toEqual([]);
    expect(r.skipped).toContain("HTTP 503");
  });

  it("does not retry client errors other than 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 400)));
    const r = await analyzeDependencies(repo);
    expect(r.covered).toEqual([]);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe("runCheck", () => {
  it("turns an analyzer crash into a skipped check instead of a failed scan", async () => {
    const logged: unknown[] = [];
    const r = await runCheck("rls", () => { throw new Error("boom"); }, (e) => logged.push(e));
    expect(r).toMatchObject({ check: "rls", covered: [], findings: [], failed: true });
    expect(logged).toHaveLength(1);
  });

  it("passes results through untouched when the analyzer succeeds", async () => {
    const ok = { check: "rls" as const, covered: ["rls"], findings: [] };
    expect(await runCheck("rls", () => ok)).toBe(ok);
  });
});
