"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldCheck } from "lucide-react";
import type { Scan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toScan, type ScanRow } from "@/lib/db";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

interface RunOptions {
  title: string;
  /** Starts the scan on the server and returns its id. */
  begin: () => Promise<{ scanId: string }>;
  /** Where to go when the scan completes; default stays on the page. */
  navigateTo?: (scan: Scan) => string | undefined;
}

const Ctx = createContext<{ start: (o: RunOptions) => void; running: boolean }>({ start: () => {}, running: false });

export function useScanRunner() {
  return useContext(Ctx);
}

export function ScanRunnerProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<RunOptions | null>(null);
  const router = useRouter();
  const start = useCallback((o: RunOptions) => setOpts(o), []);

  return (
    <Ctx.Provider value={{ start, running: !!opts }}>
      {children}
      {opts && (
        <ScanOverlay
          options={opts}
          onClose={() => setOpts(null)}
          onDone={(scan) => {
            const href = opts.navigateTo?.(scan);
            setOpts(null);
            notify(scan, `/projects/${scan.projectId}/scans/${scan.id}`, router.push);
            if (href) router.push(href);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function notify(scan: Scan, href: string, push: (h: string) => void) {
  const r = scan.resolvedFindingIds.length;
  const n = scan.newFindingIds.length;
  const action = { label: "View scan", onClick: () => push(href) };
  if (scan.error) toast.warning(scan.error);
  if (scan.trigger === "initial") {
    toast.success("Initial assessment complete", { description: n ? `${n} issue${n === 1 ? "" : "s"} found.` : "No issues found." });
  } else if (r && !n) {
    toast.success(`${r} issue${r === 1 ? "" : "s"} resolved`, { description: "Verified by re-scan. Nice work!", action });
  } else if (n && !r) {
    toast.warning(`${n} new issue${n === 1 ? "" : "s"} detected`, { description: "Introduced by the latest changes.", action });
  } else if (n && r) {
    toast(`${r} resolved · ${n} new`, { action });
  } else {
    toast("Scan complete: no changes", { description: `${scan.openFindingIds.length} open issues remain.`, action });
  }
}

function ScanOverlay({ options, onDone, onClose }: { options: RunOptions; onDone: (scan: Scan) => void; onClose: () => void }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useStore((s) => s.refresh);
  // Keep the latest callbacks without restarting the polling effect.
  const cb = useRef({ options, onDone, refresh });
  cb.current = { options, onDone, refresh };
  // Start exactly once, even when React StrictMode runs effects twice in dev.
  const begun = useRef<Promise<{ scanId: string }> | null>(null);

  useEffect(() => {
    const { options, refresh } = cb.current;
    begun.current ??= options.begin();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    (async () => {
      let scanId: string;
      try {
        ({ scanId } = await begun.current!);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the scan");
        return;
      }
      const poll = async () => {
        if (cancelled) return;
        const { data } = await supabaseBrowser().from("scans").select("*").eq("id", scanId).single();
        if (data) {
          const s = toScan(data as ScanRow);
          setScan(s);
          if (s.status === "completed") {
            await refresh();
            cb.current.onDone(s);
            return;
          }
          if (s.status === "failed") {
            await refresh();
            setError(s.error ?? "The scan failed");
            return;
          }
        }
        timer = setTimeout(poll, 700);
      };
      poll();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
     
  }, []);

  const stages = scan?.stages ?? [];
  const step = scan?.status === "queued" || !scan ? -1 : scan.stageIndex;
  const pct = stages.length ? Math.round((Math.max(0, step) / stages.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-live="polite">
      <div className="w-full max-w-md rounded-2xl border bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", error ? "bg-critical/15 text-critical" : "bg-primary/15 text-primary")}>
            {error ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
          </div>
          <div>
            <p className="font-semibold">{options.title}</p>
            <p className="text-sm text-muted">{error ? "Scan failed" : scan ? `${pct}% complete` : "Starting…"}</p>
          </div>
        </div>

        {error ? (
          <div className="mt-5 space-y-4">
            <p className="rounded-lg bg-critical/10 p-3 text-sm text-critical">{error}</p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <ul className="mt-5 space-y-2.5">
              {stages.map((s, i) => (
                <li key={s} className={cn("flex items-center gap-2.5 text-sm", i > step && "text-muted")}>
                  {i < step ? (
                    <CheckCircle2 size={16} className="shrink-0 text-ok" />
                  ) : i === step ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
                  ) : (
                    <Circle size={16} className="shrink-0 opacity-40" />
                  )}
                  {s}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
