import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import type { ProjectRow } from "@/lib/db";
import { createScan, runScan, ScanBusyError } from "@/server/scanner/engine";

const Body = z.object({ trigger: z.enum(["manual"]).default("manual") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Ownership check: RLS only returns the project if it belongs to this user.
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "App not found" }, { status: 404 });

  try {
    const scan = await createScan(project as unknown as ProjectRow, parsed.data.trigger);
    after(() => runScan(scan.id));
    return NextResponse.json({ scanId: scan.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ScanBusyError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
