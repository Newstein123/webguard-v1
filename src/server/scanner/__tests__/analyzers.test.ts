import { describe, expect, it } from "vitest";
import { scanText, redact } from "../secrets";
import { analyzeSupabaseRls } from "../analyzers/supabase-rls";
import { analyzeRepoSecrets } from "../analyzers/repo-secrets";
import { parsePackageLock } from "../analyzers/dependencies";
import { detectStack } from "../stack";
import type { RepoSnapshot } from "../types";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "c2lnbmF0dXJlc2lnbmF0dXJl"].join(".");

const snap = (files: Record<string, string>): RepoSnapshot => ({
  owner: "o",
  repo: "r",
  ref: "main",
  commit: { sha: "abc1234", message: "m", author: "a" },
  files: Object.entries(files).map(([path, content]) => ({ path, content })),
  allPaths: Object.keys(files),
});

describe("secrets", () => {
  it("detects a Stripe live key and never returns the full value", () => {
    const key = ["sk", "live", "51HcAbCdEfGhIjKlMnOpQrStUv"].join("_");
    const { matches } = scanText(`const stripe = new Stripe("${key}");`);
    expect(matches).toHaveLength(1);
    expect(matches[0].severity).toBe("critical");
    expect(matches[0].context).not.toContain(key);
    expect(matches[0].redacted).not.toContain(key);
  });

  it("flags a Supabase service_role JWT but not the anon key", () => {
    const service = jwt({ iss: "supabase", role: "service_role" });
    const anon = jwt({ iss: "supabase", role: "anon" });
    const res = scanText(`a="${anon}"; b="${service}"`);
    expect(res.matches.map((m) => m.kind)).toEqual(["supabase-service-role"]);
    expect(res.supabaseAnon).toBe(true);
  });

  it("ignores placeholders", () => {
    expect(scanText(`STRIPE_KEY="${"sk_" + "live_" + "x".repeat(24)}"`).matches).toHaveLength(0);
  });

  it("redacts to a short prefix", () => {
    expect(redact("ghp_" + "a".repeat(36))).toMatch(/^ghp_aaaaaa…\[redacted 40 chars\]$/);
  });
});

describe("repo secrets analyzer", () => {
  it("reports committed .env files with names only", () => {
    const r = analyzeRepoSecrets(snap({ ".env": "OPENAI_KEY=abc\nEMPTY=\n", ".env.example": "OPENAI_KEY=abc" }));
    const env = r.findings.filter((f) => f.ruleId === "env-file-committed");
    expect(env).toHaveLength(1);
    expect(env[0].evidence).toContain("OPENAI_KEY=<redacted>");
    expect(env[0].evidence).not.toContain("abc");
  });

  it("classifies a service_role key in client code as exposed", () => {
    const r = analyzeRepoSecrets(snap({ "src/integrations/supabase/client.ts": `const KEY = "${jwt({ iss: "supabase", role: "service_role" })}";` }));
    expect(r.findings[0].ruleId).toBe("supabase-service-role-exposed");
  });
});

describe("supabase RLS analyzer", () => {
  const m1 = `
    create table public.invoices (id uuid primary key, user_id uuid, amount int);
    alter table public.invoices enable row level security;
    create policy "Enable read access for all users" on public.invoices for select using (true);
    create table public.audit_log (id bigint);
    create table private.secrets (id int);
    create or replace function f() returns void language plpgsql as $$ begin perform 1; end; $$;
  `;

  it("finds open policies and tables without RLS", () => {
    const r = analyzeSupabaseRls(snap({ "supabase/migrations/001_init.sql": m1 }));
    const byRule = Object.fromEntries(r.findings.map((f) => [f.ruleId, f]));
    expect(byRule["supabase-rls-permissive"].severity).toBe("critical");
    expect(byRule["supabase-rls-permissive"].fingerprint).toBe('rls:invoices:Enable read access for all users');
    expect(byRule["supabase-rls-disabled"].location).toContain("audit_log");
    expect(r.findings).toHaveLength(2); // private schema ignored
  });

  it("treats a later migration that fixes the policy as resolved", () => {
    const fix = `
      drop policy if exists "Enable read access for all users" on public.invoices;
      create policy "Users read own" on public.invoices for select to authenticated using ((select auth.uid()) = user_id);
      alter table public.audit_log enable row level security;
    `;
    const r = analyzeSupabaseRls(snap({ "supabase/migrations/001_init.sql": m1, "supabase/migrations/002_fix.sql": fix }));
    expect(r.findings).toHaveLength(0);
    expect(r.covered).toEqual(["rls"]);
  });

  it("rates authenticated-only open policies as high", () => {
    const sql = `create table t (id int); alter table t enable row level security;
      create policy "all" on t for all to authenticated using (true) with check (true);`;
    const r = analyzeSupabaseRls(snap({ "supabase/migrations/1.sql": sql }));
    expect(r.findings[0].severity).toBe("high");
  });

  it("does not claim coverage when there are no migrations", () => {
    expect(analyzeSupabaseRls(snap({ "src/a.ts": "" })).covered).toEqual([]);
  });
});

describe("package-lock parser", () => {
  it("reads v3 lockfiles including nested and dev packages", () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "app" },
        "node_modules/axios": { version: "1.6.0" },
        "node_modules/vite": { version: "5.0.0", dev: true },
        "node_modules/a/node_modules/axios": { version: "0.21.1" },
      },
    });
    const pkgs = parsePackageLock(lock, "package-lock.json");
    expect(pkgs.map((p) => `${p.name}@${p.version}${p.dev ? ":dev" : ""}`).sort()).toEqual(["axios@0.21.1", "axios@1.6.0", "vite@5.0.0:dev"]);
  });
});

describe("stack detection", () => {
  it("detects a Lovable + Supabase + Vercel app", () => {
    const pkg = JSON.stringify({ dependencies: { react: "18", "@supabase/supabase-js": "2" }, devDependencies: { "lovable-tagger": "1" } });
    expect(detectStack(["supabase/config.toml", "vercel.json"], pkg)).toEqual(["Lovable", "React", "Supabase", "PostgreSQL", "Vercel"]);
  });
});
