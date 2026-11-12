import type { AnalyzerResult, RawFinding, RepoSnapshot } from "../types";
import { scanText } from "../secrets";

export const ID = "repo-secrets";

const ENV_FILE = /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults?)$/i;
const CLIENT_ENV_PREFIX = /\b(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|PUBLIC_)[A-Z0-9_]*/;
const SERVER_PATH = /(^|\/)(server|api|scripts?|supabase\/functions|functions|backend)\/|\.server\.[jt]s$/i;
const TEST_PATH = /(^|\/)(__tests__|tests?|fixtures?|__mocks__|spec)\//i;

function langFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (/^env/.test(path.split("/").pop() ?? "") || path.includes(".env")) return "bash";
  return { ts: "ts", tsx: "ts", js: "js", jsx: "js", mjs: "js", cjs: "js", json: "json", py: "python", sql: "sql", yml: "yaml", yaml: "yaml", toml: "toml" }[ext] ?? "text";
}

export function analyzeRepoSecrets(snap: RepoSnapshot): AnalyzerResult {
  const findings: RawFinding[] = [];

  for (const file of snap.files) {
    const isEnvFile = ENV_FILE.test(file.path) && !ENV_TEMPLATE.test(file.path);

    if (isEnvFile) {
      const names = file.content
        .split("\n")
        .map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
        .filter((m): m is RegExpMatchArray => !!m && m[2].trim().length > 0)
        .map((m) => `${m[1]}=<redacted>`);
      if (names.length) {
        findings.push({
          ruleId: "env-file-committed",
          severity: "high",
          fingerprint: `${ID}:envfile:${file.path}`,
          location: file.path,
          evidence: `# ${file.path} is tracked in git and contains ${names.length} value(s):\n${names.slice(0, 15).join("\n")}${names.length > 15 ? "\n…" : ""}`,
          evidenceLang: "bash",
        });
      }
    }

    const { matches } = scanText(file.content);
    for (const m of matches) {
      const lineText = m.context;
      const exposedToBrowser = CLIENT_ENV_PREFIX.test(lineText);
      const isServiceRole = m.kind === "supabase-service-role";
      // A service_role key in a client-prefixed env var, or in code outside server-only
      // folders, most likely ends up in the browser bundle.
      const likelyClientCode = !isEnvFile && !SERVER_PATH.test(file.path);
      const ruleId = isServiceRole && (exposedToBrowser || likelyClientCode) ? "supabase-service-role-exposed" : "hardcoded-secret";
      // Secrets inside test fixtures are usually fake; keep them visible but lower.
      const severity = TEST_PATH.test(file.path) && m.severity === "critical" ? "medium" : m.severity;
      findings.push({
        ruleId,
        severity,
        fingerprint: `${ID}:${m.hash}:${file.path}`,
        location: `${file.path}:${m.line}`,
        evidence: `// ${m.label} (${m.redacted})\n${lineText}`,
        evidenceLang: langFor(file.path),
      });
    }
  }

  return { covered: [ID], findings };
}
