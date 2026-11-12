-- WebGuard v1 schema. Single-user model: every row is owned by auth.users(id).
-- Reads go through RLS from the browser. Scan results are written only by the
-- server (service role). Users may update a narrow set of columns (see grants).

create extension if not exists pgcrypto;

-- ── projects ────────────────────────────────────────────────────────────────
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  source      text not null check (source in ('github', 'url')),
  repo        text check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  url         text check (url ~ '^https?://'),
  stack       text[] not null default '{}',
  monitoring  jsonb not null default '{"schedule":"daily","githubWebhooks":true,"webhookEvents":{"push":true,"pullRequest":true},"branch":"main","notifyEmail":true,"notifySlack":false}',
  created_at  timestamptz not null default now(),
  check (source <> 'github' or repo is not null),
  check (source <> 'url' or url is not null)
);
create index projects_user_idx on public.projects (user_id, created_at desc);

-- ── scans ───────────────────────────────────────────────────────────────────
create table public.scans (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  trigger               text not null check (trigger in ('initial', 'scheduled', 'github_push', 'manual')),
  status                text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  stages                text[] not null default '{}',
  stage_index           int not null default 0,
  error                 text,
  commit                jsonb,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_sec          int not null default 0,
  open_finding_ids      uuid[] not null default '{}',
  new_finding_ids       uuid[] not null default '{}',
  resolved_finding_ids  uuid[] not null default '{}'
);
create index scans_project_idx on public.scans (project_id, started_at desc);
create index scans_user_idx on public.scans (user_id, started_at desc);
-- At most one active scan per project.
create unique index scans_one_active_per_project on public.scans (project_id) where status in ('queued', 'running');

-- ── findings ────────────────────────────────────────────────────────────────
create table public.findings (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  rule_id              text not null,
  severity             text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  fingerprint          text not null,
  location             text not null,
  evidence             text not null,   -- always redacted; never a full secret
  evidence_lang        text,
  status               text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  ignored_reason       text check (char_length(ignored_reason) <= 500),
  first_seen_scan_id   uuid references public.scans(id) on delete set null,
  last_seen_scan_id    uuid references public.scans(id) on delete set null,
  resolved_in_scan_id  uuid references public.scans(id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (project_id, fingerprint)
);
create index findings_project_idx on public.findings (project_id, status);
create index findings_user_idx on public.findings (user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.projects enable row level security;
alter table public.scans    enable row level security;
alter table public.findings enable row level security;

create policy "own projects: select" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "own projects: insert" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own projects: update" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own projects: delete" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own scans: select" on public.scans for select to authenticated using ((select auth.uid()) = user_id);

create policy "own findings: select" on public.findings for select to authenticated using ((select auth.uid()) = user_id);
create policy "own findings: update" on public.findings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Least privilege: anon gets nothing; authenticated may only touch specific columns.
revoke all on public.projects, public.scans, public.findings from anon;
revoke insert, update, delete on public.projects, public.scans, public.findings from authenticated;
grant select on public.projects, public.scans, public.findings to authenticated;
grant insert (name, source, repo, url, stack, monitoring) on public.projects to authenticated;
grant update (name, url, stack, monitoring) on public.projects to authenticated;
grant delete on public.projects to authenticated;
grant update (status, ignored_reason) on public.findings to authenticated;

-- Users can ignore/reopen findings, but only the scanner can mark them resolved.
create function public.guard_finding_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.status = 'resolved' and old.status <> 'resolved' then
      raise exception 'findings can only be resolved by a scan';
    end if;
    if new.status = 'open' and old.status = 'resolved' then
      raise exception 'resolved findings reopen automatically if a scan detects them again';
    end if;
    if new.status = 'open' then
      new.ignored_reason := null;
    end if;
  end if;
  return new;
end $$;

create trigger findings_guard_status before update on public.findings
  for each row execute function public.guard_finding_status();

-- Live scan progress in the browser (RLS still applies to Realtime).
alter publication supabase_realtime add table public.scans;
