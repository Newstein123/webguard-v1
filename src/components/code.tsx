"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CodeExample } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard may be unavailable */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground",
        className,
      )}
      aria-label="Copy code"
    >
      {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CodeBlock({ code, lang, title, className }: { code: string; lang?: string; title?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface-2", className)}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-mono text-xs text-muted">{title ?? lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

export function CodeTabs({ examples }: { examples: CodeExample[] }) {
  const [i, setI] = useState(0);
  const ex = examples[i];
  if (!ex) return null;
  return (
    <div className="overflow-hidden rounded-lg border bg-surface-2">
      <div className="flex items-center justify-between gap-2 border-b pr-2">
        <div className="flex overflow-x-auto" role="tablist">
          {examples.map((e, idx) => (
            <button
              key={e.label}
              role="tab"
              aria-selected={idx === i}
              onClick={() => setI(idx)}
              className={cn(
                "whitespace-nowrap border-b-2 px-4 py-2 text-xs font-medium transition-colors",
                idx === i ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
        <CopyButton text={ex.code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{ex.code}</code>
      </pre>
    </div>
  );
}
