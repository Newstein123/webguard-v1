import { describe, expect, it } from "vitest";
import { startWorker } from "./loop";

const opts = { concurrency: 1, pollMs: 5, recoverMs: 5 };
const quiet = () => {};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe("scan worker loop", () => {
  it("runs every queued job once, then idles", async () => {
    const queue = ["a", "b", "c"];
    const ran: string[] = [];
    const w = startWorker({ claim: async () => queue.shift() ?? null, run: async (j) => void ran.push(j), recover: async () => 0, log: quiet }, opts);
    await tick();
    await w.stop();
    expect(ran).toEqual(["a", "b", "c"]);
  });

  it("stop() waits for the running job to finish and claims nothing after", async () => {
    let finish!: () => void;
    let claims = 0;
    const events: string[] = [];
    const w = startWorker(
      {
        claim: async () => (claims++ === 0 ? "job" : "should-not-run"),
        run: (j) => {
          events.push(`start ${j}`);
          return new Promise<void>((r) => (finish = () => (events.push(`end ${j}`), r())));
        },
        recover: async () => 0,
        log: quiet,
      },
      opts,
    );
    await tick();
    let stopped = false;
    const stopping = w.stop().then(() => (stopped = true));
    await tick();
    expect(stopped).toBe(false); // still waiting on the running job
    finish();
    await stopping;
    expect(events).toEqual(["start job", "end job"]);
  });

  it("survives claim errors and job crashes", async () => {
    let n = 0;
    const ran: string[] = [];
    const logs: string[] = [];
    const w = startWorker(
      {
        claim: async () => {
          n++;
          if (n === 1) throw new Error("db down");
          return n === 2 ? "crashes" : n === 3 ? "ok" : null;
        },
        run: async (j) => {
          if (j === "crashes") throw new Error("bug");
          ran.push(j);
        },
        recover: async () => 0,
        log: (m) => logs.push(m),
      },
      opts,
    );
    await tick();
    await w.stop();
    expect(ran).toEqual(["ok"]);
    expect(logs.some((l) => l.includes("claim failed"))).toBe(true);
    expect(logs.some((l) => l.includes("job crashed"))).toBe(true);
  });

  it("runs recovery periodically and keeps going if it fails", async () => {
    let calls = 0;
    const w = startWorker(
      { claim: async () => null, run: async () => {}, recover: async () => (++calls === 1 ? Promise.reject(new Error("x")) : 0), log: quiet },
      opts,
    );
    await tick(60);
    await w.stop();
    expect(calls).toBeGreaterThan(2);
  });

  it("runs jobs in parallel up to the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const queue = Array.from({ length: 6 }, (_, i) => i);
    const w = startWorker(
      {
        claim: async () => queue.shift() ?? null,
        run: async () => {
          peak = Math.max(peak, ++active);
          await tick(10);
          active--;
        },
        recover: async () => 0,
        log: quiet,
      },
      { ...opts, concurrency: 3 },
    );
    await tick(80);
    await w.stop();
    expect(peak).toBe(3);
  });
});
