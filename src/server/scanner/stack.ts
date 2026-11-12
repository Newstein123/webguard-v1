/** Technology detection from a file listing + package.json. Order matches the onboarding chips. */
export const STACK_OPTIONS = ["Lovable", "Bolt", "Replit", "Cursor", "React", "Next.js", "Express", "Supabase", "Firebase", "PostgreSQL", "Prisma", "Vercel", "Netlify"];

export function detectStack(paths: string[], packageJson?: string): string[] {
  const found = new Set<string>();
  const has = (re: RegExp) => paths.some((p) => re.test(p));

  let deps: Record<string, string> = {};
  try {
    const pkg = packageJson ? JSON.parse(packageJson) : {};
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {}
  const dep = (name: string | RegExp) => Object.keys(deps).some((d) => (typeof name === "string" ? d === name : name.test(d)));

  if (dep("lovable-tagger")) found.add("Lovable");
  if (has(/^\.bolt\//)) found.add("Bolt");
  if (has(/^\.replit$|^replit\.nix$/)) found.add("Replit");
  if (has(/^\.cursor\/|^\.cursorrules$/)) found.add("Cursor");
  if (dep("react")) found.add("React");
  if (dep("next")) found.add("Next.js");
  if (dep("express")) found.add("Express");
  if (dep(/^@supabase\//) || has(/^supabase\//)) found.add("Supabase");
  if (dep("firebase") || dep("firebase-admin") || has(/^firebase\.json$/)) found.add("Firebase");
  if (dep("prisma") || dep("@prisma/client")) found.add("Prisma");
  if (found.has("Supabase") || dep("pg") || dep("postgres")) found.add("PostgreSQL");
  if (has(/^vercel\.json$/) || has(/^\.vercel\//)) found.add("Vercel");
  if (has(/^netlify\.toml$/)) found.add("Netlify");

  return STACK_OPTIONS.filter((s) => found.has(s));
}
