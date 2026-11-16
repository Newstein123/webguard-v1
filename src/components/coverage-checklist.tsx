"use client";

import { CheckCircle2, CircleDashed, CircleMinus, CircleSlash, HelpCircle } from "lucide-react";
import { categoryCoverage, type CategoryCoverage, type CategoryStatus, type CheckCoverage } from "@/lib/coverage";
import { cn } from "@/lib/utils";

const STATUS: Record<CategoryStatus, { label: string; cls: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  checked: { label: "Checked", cls: "text-ok", Icon: CheckCircle2 },
  partial: { label: "Partly checked", cls: "text-medium", Icon: CircleDashed },
  skipped: { label: "Skipped this scan", cls: "text-high", Icon: CircleMinus },
  unknown: { label: "Not recorded", cls: "text-muted", Icon: HelpCircle },
  not_available: { label: "Not checked yet", cls: "text-muted", Icon: CircleSlash },
};

const ORDER: CategoryStatus[] = ["checked", "partial", "skipped", "unknown", "not_available"];

/**
 * The 10 security areas and what this scan actually did for each. Statuses
 * come only from the scan's stored coverage, never from the project's type.
 */
export function CoverageChecklist({
  coverage,
  developer = false,
  className,
}: {
  /** The scan's coverage; undefined for scans recorded before coverage existed. */
  coverage: CheckCoverage[] | undefined;
  developer?: boolean;
  className?: string;
}) {
  const rows = categoryCoverage(coverage).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const notYet = rows.filter((r) => r.status === "not_available");
  const shown = rows.filter((r) => r.status !== "not_available");

  return (
    <div className={className}>
      {!coverage && (
        <p className="mb-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          This scan ran before WebGuard recorded what it checked. Run a new scan to see its coverage.
        </p>
      )}
      <ul className="space-y-3">
        {shown.map((row) => (
          <CategoryRow key={row.category} row={row} developer={developer} />
        ))}
      </ul>
      {notYet.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <CircleSlash size={15} className="shrink-0" /> Not checked yet
          </p>
          <ul className="mt-1.5 space-y-1 pl-[23px] text-xs text-muted">
            {notYet.map((r) => (
              <li key={r.category}>
                <span className="text-foreground/80">{r.category}</span> · {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        “Checked” means WebGuard’s checks for that area ran in this scan. Each check has a limited scope (listed under it), so it doesn’t mean every risk in the area was covered.
      </p>
    </div>
  );
}

function CategoryRow({ row, developer }: { row: CategoryCoverage; developer: boolean }) {
  const { label, cls, Icon } = STATUS[row.status];
  return (
    <li>
      <div className="flex items-start gap-2">
        <Icon size={15} className={cn("mt-0.5 shrink-0", cls)} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-medium">{row.category}</span>
            <span className={cn("text-xs font-medium", cls)}>{label}</span>
          </p>
          <ul className="mt-1 space-y-1">
            {row.checks.map(({ def, result }) => (
              <li key={def.id} className="text-xs text-muted">
                {result?.status === "ran" ? (
                  <>
                    <span className="text-foreground/80">{def.name}:</span> {result.scope}
                  </>
                ) : result?.status === "skipped" ? (
                  <>
                    <span className="text-foreground/80">{def.name}:</span> skipped. {result.reason}
                  </>
                ) : (
                  <>
                    <span className="text-foreground/80">{def.name}:</span> {def.covers}
                  </>
                )}
                {developer && (
                  <span className="mt-0.5 block font-mono text-[11px] opacity-80">
                    {def.id} · {def.method}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
