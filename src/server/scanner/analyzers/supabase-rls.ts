import type { AnalyzerResult, RawFinding, RepoSnapshot } from "../types";

/**
 * Static analysis of Supabase migrations. We replay CREATE TABLE / ALTER TABLE
 * ... ROW LEVEL SECURITY / CREATE POLICY / DROP POLICY in file order and judge
 * the final state, so a later migration that fixes a policy resolves the finding.
 */
export const ID = "rls";

interface Policy {
  name: string;
  table: string;
  command: string; // all | select | insert | update | delete
  roles: string[];
  using?: string;
  withCheck?: string;
  permissive: boolean;
  file: string;
  sql: string;
}

interface Table {
  name: string;
  rls: boolean;
  file: string;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;

const unq = (s: string) => s.replace(/^"|"$/g, "");

function stripSql(sql: string) {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''") // function bodies
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Extract the balanced-parenthesis expression that follows `keyword (`. */
function clause(stmt: string, keyword: RegExp): string | undefined {
  const m = keyword.exec(stmt);
  if (!m) return;
  let i = m.index + m[0].length;
  while (stmt[i] === " ") i++;
  if (stmt[i] !== "(") return;
  let depth = 0;
  const start = i;
  for (; i < stmt.length; i++) {
    if (stmt[i] === "(") depth++;
    else if (stmt[i] === ")" && --depth === 0) return stmt.slice(start + 1, i).trim();
  }
}

const isTrue = (expr?: string) => !!expr && /^\(*\s*true\s*\)*$/i.test(expr.trim());

export function analyzeSupabaseRls(snap: RepoSnapshot): AnalyzerResult {
  const sqlFiles = snap.files
    .filter((f) => /(^|\/)supabase\/migrations\/[^/]+\.sql$/i.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const stackHints = snap.allPaths.some((p) => p.startsWith("supabase/")) ? ["Supabase"] : [];
  if (sqlFiles.length === 0) return { covered: [], findings: [], stackHints };

  const tables = new Map<string, Table>();
  const policies = new Map<string, Policy>();

  for (const file of sqlFiles) {
    const statements = stripSql(file.content)
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const stmt of statements) {
      let m: RegExpMatchArray | null;

      if ((m = stmt.match(new RegExp(String.raw`^create (?:unlogged )?table (?:if not exists )?${QUALIFIED}`, "i")))) {
        const schema = m[1] ? unq(m[1]) : "public";
        if (schema === "public") tables.set(unq(m[2]), { name: unq(m[2]), rls: false, file: file.path });
        continue;
      }
      if ((m = stmt.match(new RegExp(String.raw`^drop table (?:if exists )?${QUALIFIED}`, "i")))) {
        tables.delete(unq(m[2]));
        continue;
      }
      if ((m = stmt.match(new RegExp(String.raw`^alter table (?:if exists )?(?:only )?${QUALIFIED} (enable|disable) row level security`, "i")))) {
        const t = tables.get(unq(m[2]));
        if (t) t.rls = m[3].toLowerCase() === "enable";
        continue;
      }
      if ((m = stmt.match(new RegExp(String.raw`^drop policy (?:if exists )?(${IDENT}) on ${QUALIFIED}`, "i")))) {
        policies.delete(`${unq(m[3])}::${unq(m[1])}`);
        continue;
      }
      if ((m = stmt.match(new RegExp(String.raw`^create policy (${IDENT}) on ${QUALIFIED}(.*)$`, "i")))) {
        const name = unq(m[1]);
        const table = unq(m[3]);
        const rest = m[4];
        const command = rest.match(/\bfor (all|select|insert|update|delete)\b/i)?.[1].toLowerCase() ?? "all";
        const rolesRaw = rest.match(/\bto ((?:\s*,?\s*[A-Za-z_"]+)+?)(?= using\b| with check\b|$)/i)?.[1];
        const roles = rolesRaw ? rolesRaw.split(",").map((r) => unq(r.trim()).toLowerCase()) : ["public"];
        policies.set(`${table}::${name}`, {
          name,
          table,
          command,
          roles,
          using: clause(rest, /\busing\b/i),
          withCheck: clause(rest, /\bwith check\b/i),
          permissive: !/\bas restrictive\b/i.test(rest),
          file: file.path,
          sql: stmt,
        });
      }
    }
  }

  const findings: RawFinding[] = [];

  for (const t of tables.values()) {
    if (t.rls) continue;
    findings.push({
      ruleId: "supabase-rls-disabled",
      severity: "critical",
      fingerprint: `${ID}:${t.name}:disabled`,
      location: `${t.file} → public.${t.name}`,
      evidence: `-- Table public.${t.name} is created without Row Level Security.\n-- No later migration runs:\nalter table public.${t.name} enable row level security;`,
      evidenceLang: "sql",
    });
  }

  for (const p of policies.values()) {
    if (!p.permissive) continue;
    const anonymous = p.roles.some((r) => r === "anon" || r === "public");
    const reads = p.command === "select" || p.command === "all";
    const writes = p.command !== "select";
    const openRead = reads && isTrue(p.using);
    const openWrite = writes && (isTrue(p.withCheck) || (p.command !== "insert" && isTrue(p.using)));
    if (!openRead && !openWrite) continue;

    const severity = anonymous ? "critical" : "high";
    const who = anonymous ? "anyone (including signed-out visitors)" : "any signed-in user";
    const what = openRead && openWrite ? "read and change every row" : openRead ? "read every row" : "write any row";
    findings.push({
      ruleId: "supabase-rls-permissive",
      severity,
      fingerprint: `${ID}:${p.table}:${p.name}`,
      location: `${p.file} → policy "${p.name}" on public.${p.table}`,
      evidence: `-- Lets ${who} ${what} in public.${p.table}\n${p.sql.replace(/ (for|to|using|with check) /gi, "\n  $1 ")};`,
      evidenceLang: "sql",
    });
  }

  return { covered: [ID], findings, stackHints: ["Supabase", "PostgreSQL"] };
}
