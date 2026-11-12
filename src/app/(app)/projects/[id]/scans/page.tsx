"use client";

import { useParams } from "next/navigation";
import { useProjectScans } from "@/lib/data";
import { Card, CardHeader } from "@/components/ui";
import { ScanTimeline } from "@/components/scan-timeline";

export default function ScansPage() {
  const { id } = useParams<{ id: string }>();
  const scans = useProjectScans(id);
  return (
    <Card>
      <CardHeader title="Scan history" description={`${scans.length} scans · newest first`} />
      <div className="p-2">
        <ScanTimeline scans={scans} projectId={id} limit={Infinity} />
      </div>
    </Card>
  );
}
