import {
  ArrowRight,
  Bot,
  CalendarClock,
  Code2,
  Database,
  GitBranch,
  Globe,
  KeyRound,
  Lightbulb,
  Lock,
  Package,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { LinkButton } from "@/components/ui";

const builders = ["Lovable", "Bolt", "Replit", "Cursor", "Claude Code", "v0", "Hand-written code"];

const steps = [
  {
    icon: GitBranch,
    title: "Connect your app",
    body: "Paste your website URL or connect a GitHub repo. No agents to install, no config files.",
  },
  {
    icon: ShieldAlert,
    title: "Get a clear security assessment",
    body: "WebGuard checks your code and your live site, then ranks every issue by severity, with the evidence for each.",
  },
  {
    icon: Lightbulb,
    title: "Understand & fix",
    body: "Plain-language explanations, why each issue matters, and copy-paste fixes for your framework. Re-scan to confirm the fix worked.",
  },
];

const checks = [
  { icon: Database, title: "Database access policies", body: "Supabase RLS, Firebase rules, open tables" },
  { icon: KeyRound, title: "Exposed secrets", body: "API keys in code, bundles, and git history" },
  { icon: Lock, title: "Auth & access control", body: "Unprotected routes, weak sessions, IDOR" },
  { icon: Package, title: "Vulnerable dependencies", body: "Known CVEs in packages your app uses" },
  { icon: Globe, title: "Deployment config", body: "Headers, TLS, CORS, exposed files" },
  { icon: Code2, title: "Insecure code patterns", body: "Injection, open redirects, verbose errors" },
];

const audiences = [
  "Vibe coders & AI-assisted builders",
  "Indie hackers & solo founders",
  "Traditional developers",
  "Small software teams",
  "Freelancers & agencies",
  "Startup founders running SaaS",
];

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#checks" className="hover:text-foreground">What we check</a>
            <a href="#monitoring" className="hover:text-foreground">Monitoring</a>
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LinkButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </LinkButton>
            <LinkButton href="/login" size="sm">
              Get started
            </LinkButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles size={13} className="text-primary" /> Security for apps built with AI, and without it
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Build with AI. <br className="hidden sm:block" />
            Launch with confidence. <span className="text-primary">Stay secure.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            WebGuard finds the vulnerabilities in your web app and explains them in plain English. It shows you exactly how
            to fix each one, then keeps watching as your code changes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton href="/login" size="lg">
              Scan your app free <ArrowRight size={18} />
            </LinkButton>
            <LinkButton href="/dashboard" size="lg" variant="outline">
              View live demo
            </LinkButton>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <span className="text-xs uppercase tracking-wider">Works with apps built in</span>
            {builders.map((b) => (
              <span key={b} className="font-medium text-foreground/70">
                {b}
              </span>
            ))}
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Problem */}
      <section className="border-y bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3">
          <div className="md:col-span-1">
            <h2 className="text-2xl font-semibold tracking-tight">Shipping is easy now. Securing it isn’t.</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3 md:col-span-2">
            {[
              ["Built fast, secured never", "AI tools make shipping effortless, but they don’t teach you about RLS policies, leaked keys, or auth bugs."],
              ["Reports nobody understands", "Traditional scanners are built for security engineers and bury you in jargon and false alarms."],
              ["Secure today, exposed tomorrow", "Every commit, dependency bump, or config change can open a new hole. One-off audits miss it."],
            ].map(([t, b]) => (
              <div key={t}>
                <p className="font-medium">{t}</p>
                <p className="mt-2 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-sm font-semibold text-primary">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">From “is my app safe?” to “fixed” in minutes</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <s.icon size={20} />
                </span>
                <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
              </div>
              <p className="mt-4 text-lg font-semibold">{s.title}</p>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Checks */}
      <section id="checks" className="border-y bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-sm font-semibold text-primary">What we check</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Your source code and your live app, together</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {checks.map((c) => (
              <div key={c.title} className="bg-surface p-6">
                <c.icon size={20} className="text-primary" />
                <p className="mt-3 font-medium">{c.title}</p>
                <p className="mt-1 text-sm text-muted">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advisor + monitoring */}
      <section id="monitoring" className="mx-auto grid max-w-6xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-surface p-8">
          <Bot size={24} className="text-primary" />
          <h3 className="mt-4 text-xl font-semibold">Explained your way</h3>
          <p className="mt-2 text-muted">
            Switch between a <strong className="text-foreground">Simple</strong> explanation (what’s wrong and who could be
            affected) and a <strong className="text-foreground">Technical</strong> one (the exact policy, header, or line of
            code). Fixes come in your stack’s language, whether that’s Supabase SQL, Next.js, Express, or a prompt you paste back into
            Lovable.
          </p>
          <p className="mt-4 text-xs text-muted">You stay in control: always review changes before applying them.</p>
        </div>
        <div className="rounded-2xl border bg-surface p-8">
          <RefreshCw size={24} className="text-primary" />
          <h3 className="mt-4 text-xl font-semibold">Continuous monitoring</h3>
          <ul className="mt-3 space-y-3 text-muted">
            <li className="flex gap-3">
              <CalendarClock size={18} className="mt-0.5 shrink-0 text-foreground" />
              Scheduled daily or weekly scans catch drift in your deployment and new CVEs in your dependencies.
            </li>
            <li className="flex gap-3">
              <GitBranch size={18} className="mt-0.5 shrink-0 text-foreground" />
              A GitHub push triggers a new assessment, so a regression is flagged within minutes of the commit that caused it.
            </li>
            <li className="flex gap-3">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-foreground" />
              Re-scans verify your fixes actually worked, and each issue is marked resolved once it passes.
            </li>
          </ul>
        </div>
      </section>

      {/* Audiences */}
      <section className="border-t bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <Users size={22} className="mx-auto text-primary" />
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Built for everyone who ships web apps</h2>
          <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
            {audiences.map((a) => (
              <span key={a} className="rounded-full border bg-background px-4 py-1.5 text-sm">
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border bg-surface px-6 py-14 text-center">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
            You don’t need to be a security expert.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-muted">
            Connect your first app in under a minute. Free for up to 5 apps.
          </p>
          <LinkButton href="/login" size="lg" className="relative mt-8">
            Start your first scan <ArrowRight size={18} />
          </LinkButton>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo />
          <span>Build with AI. Launch with confidence. Stay secure.</span>
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="mx-auto mt-14 max-w-4xl rounded-2xl border bg-surface p-2 text-left shadow-2xl shadow-black/20">
      <div className="rounded-xl border bg-background">
        <div className="flex items-center gap-1.5 border-b px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-critical/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-medium/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-ok/60" />
          <span className="ml-3 font-mono text-xs text-muted">webguard.app/projects/invoiceflow</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[180px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-xl border bg-surface p-4">
            <span className="text-4xl font-semibold text-critical">32</span>
            <span className="text-xs font-semibold text-critical">Grade F</span>
            <span className="mt-2 text-xs text-muted">InvoiceFlow</span>
          </div>
          <div className="space-y-2">
            {[
              ["critical", "Database policy lets anyone read all customer records", "public.invoices"],
              ["high", "API route has no authentication check", "api/invoices/[id]/route.ts"],
              ["high", "Dependency with a known vulnerability", "axios@1.6.0"],
              ["medium", "Missing security headers (CSP, HSTS…)", "invoiceflow.app"],
            ].map(([sev, title, loc]) => (
              <div key={title} className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${sev === "critical" ? "bg-critical" : sev === "high" ? "bg-high" : "bg-medium"}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                <span className="hidden font-mono text-xs text-muted sm:block">{loc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
