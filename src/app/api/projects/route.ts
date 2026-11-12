import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import type { ProjectRow } from "@/lib/db";
import { parseRepo } from "@/server/scanner/github";
import { assertPublicUrl, ScanHttpError } from "@/server/scanner/http";
import { createScan, runScan } from "@/server/scanner/engine";
import { STACK_OPTIONS } from "@/server/scanner/stack";

const MAX_PROJECTS = 5; // Free plan

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(["github", "url"]),
  repo: z.string().max(200).optional(),
  url: z.union([z.string().url().max(500), z.literal("")]).optional(),
  stack: z.array(z.enum(STACK_OPTIONS as [string, ...string[]])).max(20),
  branch: z.string().regex(/^[\w./-]{1,100}$/).optional(),
});

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project details" }, { status: 400 });
  const input = parsed.data;

  const repo = input.source === "github" ? parseRepo(input.repo ?? "") : null;
  if (input.source === "github" && !repo) return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  const url = input.url || undefined;
  if (input.source === "url" && !url) return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  if (url) {
    try {
      await assertPublicUrl(url);
    } catch (e) {
      return NextResponse.json({ error: e instanceof ScanHttpError ? e.message : "Invalid URL" }, { status: 400 });
    }
  }

  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_PROJECTS) {
    return NextResponse.json({ error: `The free plan includes up to ${MAX_PROJECTS} apps.` }, { status: 403 });
  }

  // Insert as the user, so RLS and column grants apply.
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      source: input.source,
      repo: repo ? `${repo.owner}/${repo.repo}` : null,
      url: url?.replace(/\/$/, "") ?? null,
      stack: input.stack,
      monitoring: {
        schedule: "off",
        githubWebhooks: false,
        webhookEvents: { push: true, pullRequest: true },
        branch: input.branch ?? "main",
        notifyEmail: false,
        notifySlack: false,
      },
    })
    .select()
    .single();
  if (error || !project) {
    console.error("[projects.create]", error);
    return NextResponse.json({ error: "Could not create the app" }, { status: 500 });
  }

  const scan = await createScan(project as unknown as ProjectRow, "initial");
  after(() => runScan(scan.id));
  return NextResponse.json({ projectId: project.id, scanId: scan.id }, { status: 201 });
}
