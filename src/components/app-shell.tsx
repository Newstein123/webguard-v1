"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, BookOpen, ChevronDown, LayoutDashboard, LogOut, Menu, Plus, Trash2, X } from "lucide-react";
import { Logo, ThemeToggle } from "./brand";
import { ScanRunnerProvider } from "./scan-runner";
import { useStore } from "@/lib/store";
import { useProjects } from "@/lib/data";
import { cn, securityScore, scoreGrade } from "@/lib/utils";

/** Load the signed-in user's data once; pages render after it arrives. */
function useLoaded() {
  const status = useStore((s) => s.status);
  const load = useStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  return status === "ready";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useLoaded();
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <ScanRunnerProvider>
      <div className="flex min-h-dvh">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-surface transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            navOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between px-5">
            <Logo href="/dashboard" />
            <button className="lg:hidden text-muted" onClick={() => setNavOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          </div>
          {hydrated && <Sidebar pathname={pathname} />}
        </aside>
        {navOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
            <button className="lg:hidden text-muted" onClick={() => setNavOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div className="flex-1" />
            <ThemeToggle />
            <UserMenu />
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {hydrated ? children : <PageSkeleton />}
          </main>
        </div>
      </div>
    </ScanRunnerProvider>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const projects = useProjects();
  const findings = useStore((s) => s.findings);
  const nav = [
    { href: "/dashboard", label: "Projects", icon: LayoutDashboard },
    { href: "/activity", label: "Activity", icon: Activity },
  ];
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
      <div className="space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              pathname === href ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Your apps</span>
          <Link href="/projects/new" className="text-muted hover:text-foreground" aria-label="Add project">
            <Plus size={16} />
          </Link>
        </div>
        <div className="space-y-0.5">
          {projects.map((p) => {
            const open = findings.filter((f) => f.projectId === p.id && f.status === "open");
            const { tone } = scoreGrade(securityScore(open));
            const active = pathname.startsWith(`/projects/${p.id}`);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
                  active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    tone === "ok" ? "bg-ok" : tone === "medium" ? "bg-medium" : tone === "high" ? "bg-high" : "bg-critical",
                  )}
                />
                <span className="truncate">{p.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mt-auto rounded-xl border bg-surface-2 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <BookOpen size={15} className="text-primary" /> Security 101
        </div>
        <p className="mt-1 text-xs text-muted">Learn the top risks for apps built with AI tools — in plain language.</p>
      </div>
    </nav>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useStore((s) => s.user);
  const projectCount = useStore((s) => s.projects.length);
  const signOut = useStore((s) => s.signOut);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const router = useRouter();
  const initial = (user?.name ?? "?").charAt(0).toUpperCase();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2">
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-600 text-sm font-semibold text-white">
            {initial}
          </span>
        )}
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{user?.name}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border bg-surface py-1 shadow-xl">
          <div className="border-b px-4 py-2.5">
            <p className="truncate text-sm font-medium">{user?.email}</p>
            <p className="text-xs text-muted">Free plan · {projectCount} of 5 apps</p>
          </div>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-2"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-critical hover:bg-surface-2"
            onClick={async () => {
              setOpen(false);
              if (!confirm("Permanently delete your account, all apps, scans and findings? This cannot be undone.")) return;
              try {
                await deleteAccount();
                toast.success("Your account and all its data were deleted");
                router.push("/");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not delete account");
              }
            }}
          >
            <Trash2 size={15} /> Delete account
          </button>
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-surface-2" />
      <div className="h-32 rounded-xl bg-surface-2" />
      <div className="h-64 rounded-xl bg-surface-2" />
    </div>
  );
}
