"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Scan } from "@/lib/types";
import { TRIGGER_LABEL, cn, timeAgo } from "@/lib/utils";
import { TriggerIcon } from "./security";

export function ScanSummaryText({ scan }: { scan: Scan }) {
  const r = scan.resolvedFindingIds.length;
  const n = scan.newFindingIds.length;
  if (scan.status === "failed")
    return (
      <span>
        {TRIGGER_LABEL[scan.trigger]}
        <span className="text-critical"> · failed</span>
        {scan.error && <span className="text-muted">: {scan.error}</span>}
      </span>
    );
  return (
    <span>
      {TRIGGER_LABEL[scan.trigger]}
      {scan.trigger === "initial" ? (
        <span className="text-muted"> found {n} issues</span>
      ) : (
        <>
          {r > 0 && <span className="text-ok"> · {r} resolved</span>}
          {n > 0 && <span className="text-high"> · {n} new</span>}
          {!r && !n && <span className="text-muted"> · no changes</span>}
        </>
      )}
    </span>
  );
}

export function ScanTimeline({ scans, projectId, limit = 6 }: { scans: Scan[]; projectId: string; limit?: number }) {
  return (
    <ol className="relative">
      {scans.slice(0, limit).map((s, i, arr) => {
        const r = s.resolvedFindingIds.length;
        const n = s.newFindingIds.length;
        return (
          <li key={s.id} className="relative pl-12">
            {i < arr.length - 1 && <span className="absolute left-[19px] top-10 bottom-0 w-px bg-border" />}
            <span
              className={cn(
                "absolute left-1 top-3 flex h-8 w-8 items-center justify-center rounded-full border bg-surface",
                r > 0 && "border-ok/50 text-ok",
                n > 0 && !r && s.trigger !== "initial" && "border-high/50 text-high",
              )}
            >
              <TriggerIcon trigger={s.trigger} size={15} />
            </span>
            <Link href={`/projects/${projectId}/scans/${s.id}`} className="block rounded-lg px-3 py-3 hover:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{TRIGGER_LABEL[s.trigger]}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(s.startedAt)}</span>
              </div>
              {s.commit && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  <span className="rounded bg-surface-2 px-1 font-mono">{s.commit.sha}</span> {s.commit.message}
                </p>
              )}
              <div className="mt-1 flex gap-3 text-xs">
                {s.trigger === "initial" ? (
                  <span className="text-muted">{n} issues found</span>
                ) : (
                  <>
                    {r > 0 && (
                      <span className="flex items-center gap-0.5 text-ok">
                        <ArrowDownRight size={13} /> {r} resolved
                      </span>
                    )}
                    {n > 0 && (
                      <span className="flex items-center gap-0.5 text-high">
                        <ArrowUpRight size={13} /> {n} new
                      </span>
                    )}
                    {!r && !n && <span className="text-muted">No changes · {s.openFindingIds.length} open</span>}
                  </>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
