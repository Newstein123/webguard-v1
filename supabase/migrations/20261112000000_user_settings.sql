-- Per-user UI preferences. One row per user, created lazily on first change.
-- A missing row means "all defaults" (developer_mode = false).

create table public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  developer_mode  boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "own settings: select" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "own settings: insert" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own settings: update" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Least privilege: anon gets nothing; authenticated may only write the preference columns.
-- user_id is never client-supplied: it defaults to auth.uid() on insert and cannot be updated.
-- Clients upsert with on_conflict=user_id and a payload of preference columns only.
revoke all on public.user_settings from anon;
revoke insert, update, delete on public.user_settings from authenticated;
grant select on public.user_settings to authenticated;
grant insert (developer_mode, updated_at) on public.user_settings to authenticated;
grant update (developer_mode, updated_at) on public.user_settings to authenticated;
