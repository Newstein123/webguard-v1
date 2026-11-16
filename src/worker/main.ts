/**
 * Scan worker: claims queued scans from Supabase and runs them, outside the web
 * app. Run locally with `npm run worker`; deployed as a container (Dockerfile.worker).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional GITHUB_TOKEN,
 *      WORKER_CONCURRENCY (default 1), WORKER_POLL_MS (default 2000).
 */
import { claimNextScan, recoverStaleScans, runClaimedScan } from "@/server/scanner/engine";
import { startWorker } from "./loop";

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) {
    console.error(`[worker] missing required env var ${name}`);
    process.exit(1);
  }
}

const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1));
const pollMs = Math.max(250, Number(process.env.WORKER_POLL_MS ?? 2000));

const worker = startWorker(
  {
    claim: claimNextScan,
    run: async (scan) => {
      const t = Date.now();
      console.log(`[worker] scan ${scan.id} started (attempt ${scan.attempts})`);
      await runClaimedScan(scan);
      console.log(`[worker] scan ${scan.id} finished in ${Math.round((Date.now() - t) / 1000)}s`);
    },
    recover: recoverStaleScans,
  },
  { concurrency, pollMs, recoverMs: 60_000 },
);
console.log(`[worker] polling for scans (concurrency ${concurrency})`);

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (stopping) process.exit(1); // second signal: give up waiting
    stopping = true;
    console.log(`[worker] ${signal}: finishing running scans, then exiting`);
    await worker.stop();
    process.exit(0);
  });
}
