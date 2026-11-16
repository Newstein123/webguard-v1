"use client";

import { Code2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { ExplanationMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Switch } from "./ui";

export function useExplanationMode(): ExplanationMode {
  return useStore((s) => (s.developerMode ? "developer" : "normal"));
}

/** Global header toggle. Changes presentation only; findings and page state are untouched. */
export function DeveloperModeToggle({ className }: { className?: string }) {
  const on = useStore((s) => s.developerMode);
  const ready = useStore((s) => s.status === "ready");
  const setDeveloperMode = useStore((s) => s.setDeveloperMode);

  return (
    // A <label> so clicking the text also flips the switch (buttons are labelable elements).
    <label
      className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm", !ready && "opacity-50", className)}
      title={on ? "Developer Mode: technical details are shown" : "Developer Mode: show technical details for findings"}
    >
      <Code2 size={16} className={cn("shrink-0", on ? "text-primary" : "text-muted")} aria-hidden />
      <span className="hidden select-none font-medium text-muted sm:inline" aria-hidden>
        Developer Mode
      </span>
      <Switch
        checked={on}
        label="Developer Mode"
        disabled={!ready}
        onChange={(v) => setDeveloperMode(v).catch((e: Error) => toast.warning(e.message))}
      />
    </label>
  );
}
