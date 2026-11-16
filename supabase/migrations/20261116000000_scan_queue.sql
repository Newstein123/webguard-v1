-- The scans table is the job queue. The web app only inserts queued scans;
-- a separate worker process claims and runs them (see src/worker/main.ts).

alter table public.scans
  add column claimed_at   timestamptz,
  add column heartbeat_at timestamptz,
  add column attempts     int not null default 0;

create index scans_queued_idx on public.scans (started_at) where status = 'queued';
create index scans_running_heartbeat_idx on public.scans (heartbeat_at) where status = 'running';

-- Atomically hand the oldest queued scan to one worker. SKIP LOCKED lets several
-- workers poll at once without ever receiving the same scan.
create function public.claim_next_scan() returns setof public.scans
language sql set search_path = '' as $$
  update public.scans s
     set status = 'running', claimed_at = now(), heartbeat_at = now(), started_at = now(),
         stage_index = 0, attempts = s.attempts + 1
   where s.id = (
     select id from public.scans
      where status = 'queued'
      order by started_at
      limit 1
      for update skip locked
   )
  returning s.*;
$$;

-- Recover scans whose worker died (no heartbeat) and scans nobody picked up.
--  * running, heartbeat older than stale_after → requeued, or failed after max_attempts
--  * queued for longer than queued_timeout (no worker running) → failed, so the
--    one-active-scan-per-project index doesn't block new scans forever
create function public.recover_stale_scans(
  stale_after interval default '10 minutes',
  max_attempts int default 2,
  queued_timeout interval default '30 minutes'
) returns int
language plpgsql set search_path = '' as $$
declare
  requeued int;
  failed int;
  expired int;
begin
  update public.scans
     set status = 'queued', claimed_at = null, heartbeat_at = null, stage_index = 0
   where status = 'running' and heartbeat_at < now() - stale_after and attempts < max_attempts;
  get diagnostics requeued = row_count;

  update public.scans
     set status = 'failed', error = 'Scan was interrupted. Please run it again.', finished_at = now()
   where status = 'running' and heartbeat_at < now() - stale_after and attempts >= max_attempts;
  get diagnostics failed = row_count;

  update public.scans
     set status = 'failed', error = 'No scanner was available to run this scan. Please try again later.', finished_at = now()
   where status = 'queued' and started_at < now() - queued_timeout;
  get diagnostics expired = row_count;

  return requeued + failed + expired;
end $$;

-- Only the server (service role) may drive the queue. Functions are executable
-- by PUBLIC by default, so revoke that explicitly.
revoke all on function public.claim_next_scan() from public, anon, authenticated;
revoke all on function public.recover_stale_scans(interval, int, interval) from public, anon, authenticated;
grant execute on function public.claim_next_scan() to service_role;
grant execute on function public.recover_stale_scans(interval, int, interval) to service_role;
