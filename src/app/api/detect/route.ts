import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { getRepoOverview, GitHubError, parseRepo } from "@/server/scanner/github";
import { assertPublicUrl, safeFetch, ScanHttpError } from "@/server/scanner/http";
import { analyzeHeaders } from "@/server/scanner/analyzers/site";
import { detectStack, STACK_OPTIONS } from "@/server/scanner/stack";

const Body = z.discriminatedUnion("source", [
  z.object({ source: z.literal("github"), repo: z.string().min(3).max(200) }),
  z.object({ source: z.literal("url"), url: z.string().url().max(500) }),
]);

const titleCase = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Onboarding helper: validates the target and guesses name + stack. */
export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid repository or URL" }, { status: 400 });

  try {
    if (parsed.data.source === "github") {
      const ref = parseRepo(parsed.data.repo);
      if (!ref) return NextResponse.json({ error: "Use the format owner/repo or a github.com URL" }, { status: 400 });
      const { meta, paths, packageJson } = await getRepoOverview(ref.owner, ref.repo);
      const homepage = meta.homepage && /^https?:\/\//.test(meta.homepage) ? meta.homepage : "";
      return NextResponse.json({
        repo: meta.full_name,
        name: titleCase(meta.name),
        url: homepage,
        private: meta.private,
        defaultBranch: meta.default_branch,
        description: meta.description,
        stack: detectStack(paths, packageJson),
      });
    }

    const url = await assertPublicUrl(parsed.data.url);
    const page = await safeFetch(url.toString(), { maxBytes: 1_000_000 });
    const hints = analyzeHeaders(page).stackHints ?? [];
    if (/supabase\.co/.test(page.body)) hints.push("Supabase");
    if (/<div id="root">/.test(page.body) || /react/i.test(page.body)) hints.push("React");
    return NextResponse.json({
      url: page.url.replace(/\/$/, ""),
      name: new URL(page.url).hostname.replace(/^www\./, ""),
      stack: STACK_OPTIONS.filter((s) => hints.includes(s)),
    });
  } catch (e) {
    if (e instanceof GitHubError || e instanceof ScanHttpError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[detect]", e);
    return NextResponse.json({ error: "Could not reach that target" }, { status: 502 });
  }
}
