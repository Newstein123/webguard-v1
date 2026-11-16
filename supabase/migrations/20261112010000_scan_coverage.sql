-- What each check did in a scan: [{ "check": "deps", "status": "ran", "scope": "..." } |
--                                 { "check": "rls", "status": "skipped", "reason": "..." }]
-- Written by the scanner (service role) when a scan completes. Null for failed scans
-- and for scans that predate this column. Readable through the existing "own scans" policy.
alter table public.scans add column coverage jsonb
  check (coverage is null or jsonb_typeof(coverage) = 'array');
