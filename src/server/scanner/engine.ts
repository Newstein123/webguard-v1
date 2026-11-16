import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { FindingRow, ProjectRow, ScanRow } from "@/lib/db";
import type { Database } from "@/lib/database.types";
import type { ScanTrigger } from "@/lib/types";
import type { CheckId } from "@/lib/coverage";
import type { AnalyzerResult, RawFinding, RepoSnapshot } from "./types";
import { fetchSnapshot, GitHubError } from "./github";
import { ScanHttpError, type SafeResponse } from "./http";
import { analyzeRepoSecrets } from "./analyzers/repo-secrets";
import { analyzeDependencies } from "./analyzers/dependencies";
import { analyzeSupabaseRls } from "./analyzers/supabase-rls";
import { analyzeBundles, analyzeHeaders, fetchSite } from "./analyzers/site";
import { detectStack } from "./stack";
import { buildCoverage, runCheck, scanWarning } from "./coverage";

type ScanUpdate = Database["public"]["Tables"]["scans"]["Update"];

/** How often a running scan proves its worker is alive. Must be well under recover_stale_scans' stale_after. */
const HEARTBEAT_MS = 30_000;

export class ScanBusyError extends Error {
  constructor() {
    super("A scan is already running for this app.");
  }
}

interface Ctx {
  project: ProjectRow;
  snapshot?: RepoSnapshot;
  page?: SafeResponse;
  siteError?: string;
  results: AnalyzerResult[];
}

interface Stage {
  label: string;
  run: (ctx: Ctx) => Promise<void>;
}

function stagesFor(project: Pick<ProjectRow, "source" | "url">): Stage[] {
  const stages: Stage[] = [];
  if (project.source === "github") {
    stages.push(
      {
        label: "Fetching latest code from GitHub",
        run: async (ctx) => {
          const [owner, repo] = ctx.project.repo!.split("/");
          ctx.snapshot = await fetchSnapshot(owner, repo, ctx.project.monitoring?.branch);
        },
      },
      { label: "Scanning source for leaked secrets", run: async (ctx) => void ctx.results.push(await guarded(ctx, "repo-secrets", () => analyzeRepoSecrets(ctx.snapshot!))) },
      { label: "Checking dependencies against advisories", run: async (ctx) => void ctx.results.push(await guarded(ctx, "deps", () => analyzeDependencies(ctx.snapshot!))) },
      { label: "Analyzing database access policies", run: async (ctx) => void ctx.results.push(await guarded(ctx, "rls", () => analyzeSupabaseRls(ctx.snapshot!))) },
    );
  }
  if (project.url) {
    stages.push(
      {
        label: "Checking live site security headers",
        run: async (ctx) => {
          try {
            ctx.page = await fetchSite(ctx.project.url!);
            ctx.results.push(analyzeHeaders(ctx.page));
          } catch (e) {
            // For URL-only projects the site *is* the scan; for repo projects, keep going.
            if (ctx.project.source === "url") throw e;
            ctx.siteError = e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        label: "Scanning live site JavaScript for leaked keys",
        run: async (ctx) => {
          if (ctx.page) ctx.results.push(await guarded(ctx, "site-bundle", () => analyzeBundles(ctx.page!)));
        },
      },
    );
  }
  stages.push({ label: "Comparing with previous scan", run: async () => {} });
  return stages;
}

/** An analyzer crash skips that one check instead of failing the scan. */
const guarded = (ctx: Ctx, check: CheckId, fn: Parameters<typeof runCheck>[1]) =>
  runCheck(check, fn, (e) => console.error(`[scan] ${ctx.project.id}: ${check} check failed`, e));

/** Creates a queued scan row. Throws ScanBusyError if one is already active. */
export async function createScan(project: ProjectRow, trigger: ScanTrigger): Promise<ScanRow> {
  const db = supabaseAdmin();
  // Free this project's slot if an earlier scan was orphaned (also done by the worker every minute).
  await recoverStaleScans();

  const { data, error } = await db
    .from("scans")
    .insert({ project_id: project.id, user_id: project.user_id, trigger, stages: stagesFor(project).map((s) => s.label) })
    .select()
    .single();
  if (error?.code === "23505") throw new ScanBusyError();
  if (error) throw error;
  return data as ScanRow;
}

/** Hand the oldest queued scan to this worker, or null if the queue is empty. */
export async function claimNextScan(): Promise<ScanRow | null> {
  const { data, error } = await supabaseAdmin().rpc("claim_next_scan");
  if (error) throw error;
  return ((data as unknown as ScanRow[] | null) ?? [])[0] ?? null;
}

/** Requeue scans whose worker died and fail scans nobody picked up. Returns how many changed. */
export async function recoverStaleScans(): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("recover_stale_scans", {});
  if (error) throw error;
  return data ?? 0;
}

/**
 * Run a scan this worker has claimed. Every write to the scan row is fenced on
 * claimed_at: if the scan was declared stale and handed to another worker, this
 * worker's late writes match no row instead of overwriting the newer run.
 */
export async function runClaimedScan(scan: ScanRow): Promise<void> {
  const db = supabaseAdmin();
  const started = Date.now();
  const scanId = scan.id;
  const updateScan = (patch: ScanUpdate) =>
    db.from("scans").update(patch).eq("id", scanId).eq("claimed_at", scan.claimed_at!);

  const { data: project } = await db.from("projects").select("*").eq("id", scan.project_id).maybeSingle();
  if (!project) {
    // The project (or account) was deleted after the scan was queued.
    await updateScan({ status: "failed", error: "This app no longer exists.", finished_at: new Date().toISOString() });
    return;
  }
  const ctx: Ctx = { project: project as unknown as ProjectRow, results: [] };
  const stages = stagesFor(ctx.project);

  const heartbeat = setInterval(() => {
    void updateScan({ heartbeat_at: new Date().toISOString() }).then(({ error }) => {
      if (error) console.error(`[scan ${scanId}] heartbeat failed`, error.message);
    });
  }, HEARTBEAT_MS);

  try {
    for (let i = 0; i < stages.length; i++) {
      await updateScan({ stage_index: i, heartbeat_at: new Date().toISOString() });
      await stages[i].run(ctx);
    }
    const outcome = await reconcile(ctx.project, scanId, ctx.results);

    // Learn the stack from what we saw (never removes what the user chose).
    const hints = new Set<string>(ctx.results.flatMap((r) => r.stackHints ?? []));
    if (ctx.snapshot) {
      const pkg = ctx.snapshot.files.find((f) => f.path === "package.json")?.content;
      detectStack(ctx.snapshot.allPaths, pkg).forEach((s) => hints.add(s));
    }
    const stack = [...new Set([...ctx.project.stack, ...hints])];
    if (stack.length !== ctx.project.stack.length) await db.from("projects").update({ stack }).eq("id", ctx.project.id);

    await updateScan({
      status: "completed",
      stage_index: stages.length,
      commit: ctx.snapshot?.commit ?? null,
      error: scanWarning(ctx.results, ctx.siteError),
      coverage: buildCoverage(ctx.project, ctx.results, ctx.siteError),
      finished_at: new Date().toISOString(),
      duration_sec: Math.max(1, Math.round((Date.now() - started) / 1000)),
      ...outcome,
    });
  } catch (e) {
    const known = e instanceof GitHubError || e instanceof ScanHttpError || (e instanceof Error && e.message.startsWith("The site responded"));
    if (!known) console.error(`[scan ${scanId}]`, e);
    await updateScan({
      status: "failed",
      error: known ? (e as Error).message : "The scan failed unexpectedly. Please try again.",
      finished_at: new Date().toISOString(),
      duration_sec: Math.round((Date.now() - started) / 1000),
    });
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Merge this scan's raw findings with the project's history:
 *  - unseen fingerprint            → new open finding
 *  - previously resolved, seen now → reopened (regression), counted as new
 *  - ignored                       → stays ignored
 *  - open, not seen, and its analyzer ran successfully → resolved
 * Findings owned by an analyzer that did not run are left untouched.
 */
async function reconcile(project: ProjectRow, scanId: string, results: AnalyzerResult[]) {
  const db = supabaseAdmin();
  const covered = new Set(results.flatMap((r) => r.covered));
  const detected = new Map<string, RawFinding>();
  for (const f of results.flatMap((r) => r.findings)) if (!detected.has(f.fingerprint)) detected.set(f.fingerprint, f);

  const { data: existingRows, error } = await db.from("findings").select("*").eq("project_id", project.id);
  if (error) throw error;
  const existing = new Map((existingRows as FindingRow[]).map((f) => [f.fingerprint, f]));

  const newFingerprints = new Set<string>();
  const rows = [...detected.values()].map((f) => {
    const prev = existing.get(f.fingerprint);
    if (!prev || prev.status === "resolved") newFingerprints.add(f.fingerprint);
    return {
      project_id: project.id,
      user_id: project.user_id,
      rule_id: f.ruleId,
      severity: f.severity,
      fingerprint: f.fingerprint,
      location: f.location,
      evidence: f.evidence,
      evidence_lang: f.evidenceLang ?? null,
      status: prev?.status === "ignored" ? "ignored" : "open",
      ignored_reason: prev?.status === "ignored" ? prev.ignored_reason : null,
      first_seen_scan_id: prev?.first_seen_scan_id ?? scanId,
      last_seen_scan_id: scanId,
      resolved_in_scan_id: null,
    };
  });

  const upserted: FindingRow[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error: e } = await db
      .from("findings")
      .upsert(rows.slice(i, i + 500), { onConflict: "project_id,fingerprint" })
      .select("*");
    if (e) throw e;
    upserted.push(...(data as FindingRow[]));
  }

  const toResolve = [...existing.values()].filter(
    (f) => f.status === "open" && !detected.has(f.fingerprint) && covered.has(f.fingerprint.split(":")[0]),
  );
  if (toResolve.length) {
    const { error: e } = await db
      .from("findings")
      .update({ status: "resolved", resolved_in_scan_id: scanId })
      .in("id", toResolve.map((f) => f.id));
    if (e) throw e;
  }

  const resolvedIds = new Set(toResolve.map((f) => f.id));
  const stillOpenUntouched = [...existing.values()].filter(
    (f) => f.status === "open" && !detected.has(f.fingerprint) && !resolvedIds.has(f.id),
  );
  return {
    open_finding_ids: [...upserted.filter((f) => f.status === "open"), ...stillOpenUntouched].map((f) => f.id),
    new_finding_ids: upserted.filter((f) => newFingerprints.has(f.fingerprint) && f.status === "open").map((f) => f.id),
    resolved_finding_ids: [...resolvedIds],
  };
}
