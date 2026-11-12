"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Mail, Play, Trash2, Webhook } from "lucide-react";
import { useProject, useProjectScans } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { useScanRunner } from "@/components/scan-runner";

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id)!;
  const scans = useProjectScans(id);
  const startScan = useStore((s) => s.startScan);
  const deleteProject = useStore((s) => s.deleteProject);
  const { start, running } = useScanRunner();
  const router = useRouter();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader
            title="Continuous monitoring"
            description="Automatic re-scans and alerts are on the way. Until then, run a scan whenever you ship a change."
            action={<Badge>Coming soon</Badge>}
          />
          <ul className="divide-y">
            <Upcoming icon={<CalendarClock size={17} />} title="Scheduled scans" body="Daily or weekly re-assessment to catch new advisories and configuration drift." />
            {project.source === "github" && (
              <Upcoming icon={<Webhook size={17} />} title="Scan on every push" body="A scan starts automatically when you push to your main branch, through the WebGuard GitHub App." />
            )}
            <Upcoming icon={<Mail size={17} />} title="Email alerts" body="Get an email when a scan finds a new critical or high issue." />
          </ul>
        </Card>

        <Card className="border-critical/30">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Remove this app</p>
              <p className="text-sm text-muted">Permanently deletes its scan history and findings.</p>
            </div>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Remove ${project.name} from WebGuard? This deletes all of its scans and findings.`)) return;
                try {
                  await deleteProject(id);
                  router.push("/dashboard");
                  toast("App removed");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not remove app");
                }
              }}
            >
              <Trash2 size={16} /> Remove
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <Card className="lg:sticky lg:top-24">
          <CardHeader title="Run a scan" description={scans[0] ? `Last scan: ${formatDateTime(scans[0].startedAt)}` : "No completed scans yet"} />
          <div className="p-5">
            <Button className="w-full" disabled={running} onClick={() => start({ title: `Re-scanning ${project.name}`, begin: () => startScan(id) })}>
              <Play size={16} /> Scan now
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Upcoming({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3 px-5 py-4">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </li>
  );
}
