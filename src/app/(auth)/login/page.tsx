"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { GithubIcon, Logo, ThemeToggle } from "@/components/brand";
import { Button, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

const GITHUB_ENABLED = process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [loading, setLoading] = useState<"github" | "email" | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "That sign-in link is invalid or has expired. Request a new one." : null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const github = async () => {
    setLoading("github");
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectTo() } });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("email");
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setLoading(null);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-2xl border bg-surface p-8 shadow-xl">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 size={36} className="mx-auto text-ok" />
              <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted">
                We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
              </p>
              <Button variant="ghost" className="mt-6" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome to WebGuard</h1>
              <p className="mt-1 text-sm text-muted">Sign in to start securing your apps.</p>

              <Button className="mt-6 w-full" size="lg" onClick={github} disabled={!!loading || !GITHUB_ENABLED}>
                {loading === "github" ? <Loader2 size={18} className="animate-spin" /> : <GithubIcon />}
                Continue with GitHub
              </Button>
              {!GITHUB_ENABLED && <p className="mt-2 text-center text-xs text-muted">GitHub sign-in is not configured in this environment.</p>}

              <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={magicLink} className="space-y-3">
                <Input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <Button variant="outline" className="w-full" type="submit" disabled={!!loading || !email}>
                  {loading === "email" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  Send magic link
                </Button>
              </form>

              {error && <p className="mt-4 rounded-lg bg-critical/10 p-3 text-sm text-critical">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
