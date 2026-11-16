import { describe, expect, it } from "vitest";
import { buildCoverage } from "../coverage";
import { analyzeSupabaseRls, ID as RLS_ID } from "../analyzers/supabase-rls";
import { analyzeRepoSecrets, ID as SECRETS_ID } from "../analyzers/repo-secrets";
import { analyzeDependencies, ID as DEPS_ID } from "../analyzers/dependencies";
import { BUNDLE_ID, HEADERS_ID } from "../analyzers/site";
import { CHECKS } from "@/lib/coverage";
import type { AnalyzerResult, RepoSnapshot } from "../types";

const snap = (files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot => ({
  owner: "o",
  repo: "r",
  ref: "main",
  commit: { sha: "abc1234", message: "m", author: "a" },
  files: Object.entries(files).map(([path, content]) => ({ path, content })),
  allPaths: [...Object.keys(files), ...extraPaths],
});
const github = { source: "github" as const, url: "https://app.test" };
const byCheck = (c: ReturnType<typeof buildCoverage>) => Object.fromEntries(c.map((x) => [x.check, x]));
const ran = (check: AnalyzerResult["check"], scope = "s"): AnalyzerResult => ({ check, covered: [check], findings: [], scope });

describe("check ids", () => {
  it("match the analyzer ids the engine uses to resolve findings", () => {
    expect(CHECKS.map((c) => c.id).sort()).toEqual([BUNDLE_ID, DEPS_ID, HEADERS_ID, SECRETS_ID, RLS_ID].sort());
  });
});

describe("buildCoverage", () => {
  it("records every check as ran, with the scope the analyzer reported", () => {
    const c = byCheck(buildCoverage(github, CHECKS.map((d) => ran(d.id, `scope of ${d.id}`))));
    for (const d of CHECKS) expect(c[d.id]).toEqual({ check: d.id, status: "ran", scope: `scope of ${d.id}` });
  });

  it("uses the analyzer's own reason when it could not run (real analyzers)", async () => {
    const repo = snap({ "src/a.ts": "export {}" }, ["bun.lockb"]);
    const results = [analyzeRepoSecrets(repo), analyzeSupabaseRls(repo), await analyzeDependencies(repo), ran("site-headers"), ran("site-bundle")];
    const c = byCheck(buildCoverage(github, results));
    expect(c["repo-secrets"]).toMatchObject({ status: "ran", scope: "1 file in o/r@main" });
    expect(c.rls).toEqual({ check: "rls", status: "skipped", reason: "No supabase/migrations/*.sql files found in the repository." });
    expect(c.deps).toEqual({ check: "deps", status: "skipped", reason: "Only npm's package-lock.json is supported so far (found bun.lockb)." });
  });

  it("describes what the RLS analyzer examined", () => {
    const repo = snap({ "supabase/migrations/01.sql": "create table public.todos (id int); alter table public.todos enable row level security;" });
    expect(byCheck(buildCoverage(github, [analyzeSupabaseRls(repo)])).rls).toEqual({ check: "rls", status: "ran", scope: "1 migration file, 1 public table" });
  });

  it("marks repository checks as skipped for URL-only projects", () => {
    const c = byCheck(buildCoverage({ source: "url", url: "https://app.test" }, [ran("site-headers"), ran("site-bundle")]));
    for (const id of ["repo-secrets", "rls", "deps"] as const) expect(c[id]).toMatchObject({ status: "skipped", reason: "Needs a connected GitHub repository." });
    expect(c["site-headers"].status).toBe("ran");
  });

  it("marks live-site checks as skipped when there is no URL or the site was unreachable", () => {
    const repoOnly = byCheck(buildCoverage({ source: "github", url: null }, [ran("repo-secrets")]));
    expect(repoOnly["site-headers"]).toMatchObject({ status: "skipped", reason: "Needs the URL of your deployed site." });
    const down = byCheck(buildCoverage(github, [ran("repo-secrets")], "The site responded with HTTP 503"));
    expect(down["site-bundle"]).toMatchObject({ status: "skipped", reason: "Your live site couldn't be checked: The site responded with HTTP 503" });
  });

  it("never reports a check as ran unless its analyzer claimed coverage", () => {
    const c = byCheck(buildCoverage(github, [{ check: "deps", covered: [], findings: [] }]));
    expect(c.deps.status).toBe("skipped");
    expect(Object.values(c).filter((x) => x.status === "ran")).toEqual([]);
  });
});

describe("live bundle scope", () => {
  it("states how many same-domain scripts were scanned", async () => {
    const { analyzeBundles } = await import("../analyzers/site");
    const page = { url: "https://app.test/", status: 200, headers: new Headers(), body: "<html></html>", truncated: false };
    expect((await analyzeBundles(page)).scope).toBe("https://app.test homepage (it loads no scripts from its own domain)");
  });
});
