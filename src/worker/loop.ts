/**
 * The scan worker's control loop, independent of Supabase so it can be tested.
 *
 * - `concurrency` slots each repeatedly claim a job and run it, sleeping
 *   `pollMs` when the queue is empty.
 * - `recover` runs every `recoverMs` to requeue scans whose worker died.
 * - stop() stops claiming new jobs, waits for running ones, then resolves.
 *   A job interrupted by a hard kill is recovered later by `recover`.
 */
export interface WorkerDeps<Job> {
  claim: () => Promise<Job | null>;
  run: (job: Job) => Promise<void>;
  recover: () => Promise<number>;
  log?: (msg: string, err?: unknown) => void;
}

export interface WorkerOptions {
  concurrency: number;
  pollMs: number;
  recoverMs: number;
}

export function startWorker<Job>(deps: WorkerDeps<Job>, opts: WorkerOptions) {
  const log = deps.log ?? ((msg, err) => (err ? console.error(msg, err) : console.log(msg)));
  let stopping = false;
  const wakers = new Set<() => void>();

  /** Sleep that ends early when stop() is called. */
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        wakers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      wakers.add(done);
    });

  const slot = async (n: number) => {
    while (!stopping) {
      let job: Job | null = null;
      try {
        job = await deps.claim();
      } catch (e) {
        log(`[worker] slot ${n}: claim failed`, e);
      }
      if (!job) {
        await sleep(opts.pollMs);
        continue;
      }
      try {
        await deps.run(job);
      } catch (e) {
        // run() records its own failures; this only catches bugs in it.
        log(`[worker] slot ${n}: job crashed`, e);
      }
    }
  };

  const recoverLoop = async () => {
    while (!stopping) {
      try {
        const n = await deps.recover();
        if (n) log(`[worker] recovered ${n} stale scan(s)`);
      } catch (e) {
        log("[worker] recovery failed", e);
      }
      await sleep(opts.recoverMs);
    }
  };

  const done = Promise.all([...Array.from({ length: opts.concurrency }, (_, i) => slot(i)), recoverLoop()]);

  return {
    stop: async () => {
      stopping = true;
      for (const wake of [...wakers]) wake();
      await done;
    },
  };
}
