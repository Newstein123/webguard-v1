"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, Lock, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import { Button, Card, Input } from "@/components/ui";
import { GithubIcon } from "@/components/brand";
import { useScanRunner } from "@/components/scan-runner";

const STACK_OPTIONS = ["Lovable", "Bolt", "Replit", "Cursor", "React", "Next.js", "Express", "Supabase", "Firebase", "PostgreSQL", "Prisma", "Vercel", "Netlify"];

interface Detected {
  name: string;
  url?: string;
  repo?: string;
  private?: boolean;
  defaultBranch?: string;
  description?: string | null;
  stack: string[];
}

type Step = 0 | 1;

interface RepoSummary {
  fullName: string;
  description: string | null;
  language: string | null;
  pushedAt: string;
  fork: boolean;
}

/** The signed-in user's public GitHub repos (null while loading). */
function useMyRepos() {
  const [state, setState] = useState<{ login: string | null; repos: RepoSummary[]; error?: string } | null>(null);
  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ login: null, repos: [], error: "Could not load your repositories" }));
  }, []);
  return state;
}

export default function NewProjectPage() {
  const createProject = useStore((s) => s.createProject);
  const { start, running } = useScanRunner();
  const [step, setStep] = useState<Step>(0);
  const [source, setSource] = useState<"github" | "url">("github");
  const [target, setTarget] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [q, setQ] = useState("");
  const myRepos = useMyRepos();
  const shownRepos = (myRepos?.repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);

  const canContinue = source === "github" ? target.trim().length > 2 : /^https?:\/\/.+\..+/.test(target.trim());
  const urlValid = !url || /^https?:\/\/.+\..+/.test(url);

  const detect = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(source === "github" ? { source, repo: target.trim() } : { source, url: target.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not reach that target");
      setDetected(body);
      setName(body.name);
      setUrl(body.url ?? "");
      setStack(body.stack ?? []);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDetecting(false);
    }
  };

  const launch = () =>
    start({
      title: `Initial assessment: ${name}`,
      begin: async () => {
        const { scanId } = await createProject({
          name: name.trim(),
          source,
          repo: source === "github" ? detected?.repo : undefined,
          branch: source === "github" ? detected?.defaultBranch : undefined,
          url: url.trim() || undefined,
          stack,
        });
        return { scanId };
      },
      navigateTo: (scan) => `/projects/${scan.projectId}`,
    });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect an app</h1>
        <p className="mt-1 text-sm text-muted">We’ll run a security assessment and explain everything we find in plain language.</p>
      </div>

      <Stepper step={step} />

      {step === 0 && (
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { key: "github", icon: <GithubIcon size={20} />, title: "GitHub repository", body: "Source code + deployed site. Best coverage." },
                { key: "url", icon: <Globe size={20} />, title: "Website URL", body: "Scan the live app only. No code access needed." },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setSource(o.key);
                  setTarget("");
                  setError(null);
                }}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  source === o.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-surface-2",
                )}
              >
                {o.icon}
                <p className="mt-3 text-sm font-medium">{o.title}</p>
                <p className="mt-1 text-xs text-muted">{o.body}</p>
              </button>
            ))}
          </div>

          {source === "github" && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <GithubIcon size={15} /> {myRepos?.login ?? "Your repositories"}
                </span>
                {myRepos?.login && <span className="text-xs text-ok">● GitHub connected</span>}
              </div>
              {myRepos === null ? (
                <p className="flex items-center gap-2 py-3 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" /> Loading your repositories…
                </p>
              ) : !myRepos.login ? (
                <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">Sign in with GitHub to pick from your repositories, or enter one below.</p>
              ) : myRepos.error ? (
                <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">{myRepos.error}</p>
              ) : myRepos.repos.length === 0 ? (
                <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">No public repositories found on {myRepos.login}.</p>
              ) : (
                <>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search repositories…" className="pl-9" />
                  </div>
                  <ul className="mt-3 divide-y overflow-hidden rounded-lg border">
                    {shownRepos.map((r) => (
                      <li key={r.fullName}>
                        <button
                          type="button"
                          onClick={() => setTarget(r.fullName)}
                          className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2", target === r.fullName && "bg-primary/5")}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                              target === r.fullName && "border-primary bg-primary text-primary-fg",
                            )}
                          >
                            {target === r.fullName && <Check size={12} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {r.fullName}
                              {r.fork && <span className="ml-1.5 text-xs font-normal text-muted">fork</span>}
                            </p>
                            <p className="truncate text-xs text-muted">{r.description ?? r.language ?? "No description"}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted">{timeAgo(r.pushedAt)}</span>
                        </button>
                      </li>
                    ))}
                    {shownRepos.length === 0 && <li className="px-4 py-3 text-sm text-muted">No matching repositories.</li>}
                  </ul>
                </>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Lock size={12} /> Private repositories are coming soon with the WebGuard GitHub App.
              </p>
            </div>
          )}

          <form onSubmit={detect} className="mt-6">
            <label className="text-sm font-medium" htmlFor="target">
              {source === "github" ? "Or enter any public repository" : "Website URL"}
            </label>
            <Input
              id="target"
              autoFocus={source === "url"}
              className="mt-2 font-mono"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={source === "github" ? "owner/repo or https://github.com/owner/repo" : "https://your-app.com"}
            />
            <p className="mt-2 text-xs text-muted">
              {source === "github"
                ? "Public repositories work right away. We read your code through the GitHub API, never run it, and never store it."
                : "We only run passive checks, the same requests any visitor’s browser makes."}
            </p>
            {error && <p className="mt-3 rounded-lg bg-critical/10 p-3 text-sm text-critical">{error}</p>}
            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={!canContinue || detecting}>
                {detecting ? <Loader2 size={16} className="animate-spin" /> : null}
                {detecting ? "Detecting…" : "Continue"} {!detecting && <ArrowRight size={16} />}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 1 && detected && (
        <Card className="p-6">
          {detected.repo && (
            <p className="mb-4 flex items-center gap-2 text-sm text-muted">
              <GithubIcon size={14} /> <span className="font-mono">{detected.repo}</span>
              {detected.private && <Lock size={12} />}
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-primary">
            <Sparkles size={15} /> {stack.length ? "We detected your stack" : "Tell us about your stack"}
          </div>
          <label className="mt-4 block text-sm font-medium" htmlFor="name">
            App name
          </label>
          <Input id="name" className="mt-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          {source === "github" && (
            <>
              <label className="mt-4 block text-sm font-medium" htmlFor="durl">
                Deployed URL <span className="font-normal text-muted">(optional, enables live site checks)</span>
              </label>
              <Input id="durl" className="mt-2 font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com" />
              {!urlValid && <p className="mt-1 text-xs text-critical">Enter a full URL starting with https://</p>}
            </>
          )}
          <p className="mt-5 text-sm font-medium">Technologies</p>
          <p className="text-xs text-muted">We tailor fix instructions to these. Tap to adjust.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STACK_OPTIONS.map((s) => {
              const on = stack.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => setStack(on ? stack.filter((x) => x !== s) : [...stack, s])}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    on ? "border-primary bg-primary/10 text-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  {on && <Check size={12} className="-ml-0.5 mr-1 inline" />}
                  {s}
                </button>
              );
            })}
          </div>

          {(url || source === "url") && (
            <label className="mt-6 flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-muted">I own this site or have permission to scan it.</span>
            </label>
          )}

          <div className="mt-6 rounded-lg bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck size={16} className="text-primary" /> Ready to scan {name || "your app"}
            </p>
            <p className="mt-1 text-xs text-muted">Usually takes under a minute.</p>
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft size={16} /> Back
            </Button>
            <Button onClick={launch} disabled={running || !name.trim() || !urlValid || ((!!url || source === "url") && !consent)}>
              <Star size={16} /> Start security assessment
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Connect", "Confirm & scan"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              i < step && "border-primary bg-primary text-primary-fg",
              i === step && "border-primary text-primary",
              i > step && "text-muted",
            )}
          >
            {i < step ? <Check size={14} /> : i + 1}
          </span>
          <span className={cn("hidden text-sm sm:block", i === step ? "font-medium" : "text-muted")}>{l}</span>
          {i < labels.length - 1 && <span className="h-px flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
