import { describe, expect, it } from "vitest";
import { analyzeApiAuth } from "../analyzers/api-auth";
import type { RepoSnapshot } from "../types";

const snap = (files: Record<string, string>): RepoSnapshot => ({
  owner: "o",
  repo: "r",
  ref: "main",
  commit: { sha: "abc", message: "m", author: "a" },
  files: Object.entries(files).map(([path, content]) => ({ path, content })),
  allPaths: Object.keys(files),
});

const ADMIN_MODULE = `import { createClient } from "@supabase/supabase-js";
export const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);`;
const USER_CLIENT_MODULE = `import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => store.getAll() } });
}`;
const PRISMA_MODULE = `import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();`;

describe("API route auth check: flags", () => {
  it("an App Router route using an imported admin client with no auth check", () => {
    const r = analyzeApiAuth(
      snap({
        "src/lib/supabase/admin.ts": ADMIN_MODULE,
        "src/app/(dashboard)/api/invoices/[id]/route.ts": `import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await supabaseAdmin.from("invoices").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { data } = await supabaseAdmin.from("invoices").select("*");
  return NextResponse.json(data);
}`,
      }),
    );
    expect(r.covered).toEqual(["api-auth"]);
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0];
    expect(f).toMatchObject({ ruleId: "unprotected-api-route", severity: "high", fingerprint: "api-auth:src/app/(dashboard)/api/invoices/[id]/route.ts" });
    expect(f.location).toBe("src/app/(dashboard)/api/invoices/[id]/route.ts:2 → DELETE, GET /api/invoices/[id]"); // route group dropped
    expect(f.evidence).toContain("Reads and writes data with Supabase service-role key (bypasses RLS)");
    expect(f.evidence).toContain("L2: import { supabaseAdmin } from \"@/lib/supabase/admin\"   ← src/lib/supabase/admin.ts uses");
    expect(f.evidence).toContain('L6: await supabaseAdmin.from("invoices").delete().eq("id", id);');
  });

  it("a pages/api handler using Prisma without a session check", () => {
    const r = analyzeApiAuth(
      snap({
        "lib/prisma.ts": PRISMA_MODULE,
        "pages/api/users/index.ts": `import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const users = await prisma.user.findMany();
  res.json(users);
}`,
      }),
    );
    expect(r.findings[0].location).toBe("pages/api/users/index.ts:2 → ALL /api/users");
    expect(r.findings[0].evidence).toContain("Reads data with Prisma");
  });

  it("a Supabase Edge Function using the service-role key without checking the caller", () => {
    const r = analyzeApiAuth(
      snap({
        "supabase/functions/delete-account/index.ts": `import { createClient } from "jsr:@supabase/supabase-js@2";
Deno.serve(async (req) => {
  const { userId } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.auth.admin.deleteUser(userId);
  return new Response("ok");
});`,
        "supabase/functions/_shared/cors.ts": `export const cors = {};`,
      }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].location).toBe("supabase/functions/delete-account/index.ts:4 → ALL /functions/v1/delete-account");
    expect(r.findings[0].evidence).toContain("Reads and writes data"); // auth.admin.deleteUser is a write
  });

  it("admin access through an import wrapped over several lines", () => {
    const r = analyzeApiAuth(
      snap({
        "utils/supabase/admin.ts": ADMIN_MODULE,
        "app/api/products/route.ts": `import {
  upsertProductRecord,
  deleteProductRecord
} from '@/utils/supabase/admin';

export async function POST(req: Request) {
  await upsertProductRecord(await req.json());
  return new Response("ok");
}`,
      }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].location).toBe("app/api/products/route.ts:1 → POST /api/products");
    expect(r.findings[0].evidence).toContain("L1: import { upsertProductRecord, deleteProductRecord } from '@/utils/supabase/admin'   ← utils/supabase/admin.ts uses Supabase service-role key");
  });

  it("a webhook that never verifies the signature", () => {
    const r = analyzeApiAuth(
      snap({
        "app/api/webhooks/stripe/route.ts": `import { supabaseAdmin } from "@/lib/admin";
export async function POST(req: Request) {
  const event = await req.json();
  await supabaseAdmin.from("orders").update({ paid: true }).eq("id", event.data.object.id);
  return new Response("ok");
}`,
        "lib/admin.ts": ADMIN_MODULE,
      }),
    );
    expect(r.findings).toHaveLength(1);
  });

  it("never puts a secret into evidence", () => {
    const key = ["sk_live", "51HcAbCdEfGhIjKlMnOpQrStUvWx"].join("_");
    const r = analyzeApiAuth(
      snap({
        "app/api/charge/route.ts": `import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const stripe = new Stripe("${key}");
export async function POST() { await prisma.order.create({ data: {} }); return Response.json({}); }`,
      }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].evidence).not.toContain(key);
  });

  it("lowers severity and says so when an auth middleware might cover the route", () => {
    const r = analyzeApiAuth(
      snap({
        "src/middleware.ts": `import { NextResponse } from "next/server";
export async function middleware(req) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
}`,
        "src/lib/admin.ts": ADMIN_MODULE,
        "src/app/api/stats/route.ts": `import { supabaseAdmin } from "@/lib/admin";
export async function GET() { return Response.json(await supabaseAdmin.from("stats").select()); }`,
      }),
    );
    expect(r.findings[0].severity).toBe("medium");
    expect(r.findings[0].evidence).toContain("src/middleware.ts contains an authentication check");
  });
});

describe("API route auth check: does not flag", () => {
  const admin = { "src/lib/supabase/admin.ts": ADMIN_MODULE };
  const route = (body: string) => `import { supabaseAdmin } from "@/lib/supabase/admin";\n${body}`;
  const cases: Record<string, Record<string, string>> = {
    "a route that checks the Supabase user": {
      ...admin,
      "src/app/api/a/route.ts": route(`import { createClient } from "@/lib/supabase/server";
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await supabaseAdmin.from("x").insert({ user_id: user.id });
}`),
    },
    "a user-scoped Supabase client (RLS applies)": {
      "src/lib/supabase/server.ts": USER_CLIENT_MODULE,
      "src/app/api/b/route.ts": `import { createClient } from "@/lib/supabase/server";
export async function POST(req: Request) { const s = await createClient(); await s.from("todos").insert(await req.json()); return Response.json({}); }`,
    },
    "NextAuth getServerSession with Prisma": {
      "lib/prisma.ts": PRISMA_MODULE,
      "pages/api/c.ts": `import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
export default async function h(req, res) { const s = await getServerSession(req, res, opts); if (!s) return res.status(401).end(); res.json(await prisma.post.findMany()); }`,
    },
    "Clerk auth()": {
      ...admin,
      "app/api/d/route.ts": route(`import { auth } from "@clerk/nextjs/server";
export async function GET() { const { userId } = await auth(); if (!userId) return new Response(null, { status: 401 }); return Response.json(await supabaseAdmin.from("x").select()); }`),
    },
    "a project auth helper": {
      ...admin,
      "app/api/e/route.ts": route(`import { requireUser } from "@/lib/auth";
export async function GET() { const user = await requireUser(); return Response.json(await supabaseAdmin.from("x").select().eq("owner", user.id)); }`),
    },
    "a withAuth wrapper": {
      ...admin,
      "app/api/f/route.ts": route(`import { withAuth } from "@/lib/with-auth";
export const GET = withAuth(async () => Response.json(await supabaseAdmin.from("x").select()));`),
    },
    "a Stripe webhook that verifies the signature": {
      ...admin,
      "app/api/webhooks/stripe/route.ts": route(`export async function POST(req: Request) {
  const event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!);
  await supabaseAdmin.from("orders").update({ paid: true });
}`),
    },
    "a cron job checking CRON_SECRET": {
      ...admin,
      "app/api/cron/cleanup/route.ts": route(`export async function GET(req: Request) {
  if (req.headers.get("authorization") !== \`Bearer \${process.env.CRON_SECRET}\`) return new Response(null, { status: 401 });
  await supabaseAdmin.from("sessions").delete().lt("expires", new Date().toISOString());
}`),
    },
    "an auth callback (public by design)": {
      ...admin,
      "app/auth/callback/route.ts": route(`export async function GET() { await supabaseAdmin.from("profiles").upsert({}); }`),
    },
    "a test file": {
      ...admin,
      "app/api/__tests__/route.test.ts": route(`export async function GET() { await supabaseAdmin.from("x").delete(); }`),
    },
  };
  for (const [name, files] of Object.entries(cases)) {
    it(name, () => {
      const r = analyzeApiAuth(snap(files));
      expect(r.findings).toEqual([]);
      expect(r.covered).toEqual(["api-auth"]);
    });
  }

  it("reports scope, including routes skipped as public", () => {
    const r = analyzeApiAuth(snap(cases["an auth callback (public by design)"]));
    expect(r.scope).toBe("1 API route, 1 with admin database access (1 public by design, e.g. auth callbacks, not flagged)");
    expect(analyzeApiAuth(snap({ "src/a.ts": "" })).scope).toMatch(/^No API routes found/);
  });
});
