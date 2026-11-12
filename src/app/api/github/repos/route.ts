import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { GitHubError, listPublicRepos } from "@/server/scanner/github";

/**
 * Lists the signed-in user's public GitHub repos for the onboarding picker.
 * The login comes from the verified GitHub identity, never from the request.
 * Private repos need the WebGuard GitHub App (post-MVP).
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const identity = user.identities?.find((i) => i.provider === "github");
  const login = (identity?.identity_data?.user_name ?? identity?.identity_data?.preferred_username) as string | undefined;
  if (!login) return NextResponse.json({ login: null, repos: [] });
  try {
    return NextResponse.json({ login, repos: await listPublicRepos(login) });
  } catch (e) {
    const message = e instanceof GitHubError ? e.message : "Could not load your repositories";
    return NextResponse.json({ login, repos: [], error: message }, { status: 502 });
  }
}
