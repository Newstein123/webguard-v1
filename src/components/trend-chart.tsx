"use client";

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Finding, Scan } from "@/lib/types";
import { securityScore } from "@/lib/utils";

export function TrendChart({ scans, findings }: { scans: Scan[]; findings: Finding[] }) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const data = [...scans]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((s) => {
      const open = s.openFindingIds.map((id) => byId.get(id)).filter(Boolean) as Finding[];
      return {
        date: new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        score: securityScore(open),
        open: open.length,
      };
    });

  if (data.length < 2)
    return <p className="py-10 text-center text-sm text-muted">The trend will show up after your next scan.</p>;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="score" domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="open" orientation="right" hide allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Area yAxisId="score" type="monotone" dataKey="score" name="Score" stroke="var(--primary)" strokeWidth={2} fill="url(#scoreFill)" />
          <Line yAxisId="open" type="stepAfter" dataKey="open" name="Open issues" stroke="var(--sev-high)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
