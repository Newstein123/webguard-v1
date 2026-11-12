import "server-only";
import { gunzipSync } from "node:zlib";
import type { RepoFile, RepoSnapshot } from "./types";

/**
 * Reads a repository through the GitHub API without cloning: one tarball
 * download, parsed in memory, never written to disk. Nothing in the repo is
 * ever executed.
 */

const API = "https://api.github.com";
const MAX_TARBALL_BYTES = 60 * 1024 * 1024;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_LOCKFILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 3000;

const SKIP_DIRS = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|vendor|\.turbo|\.vercel|\.cache)\//;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|svg|bmp|tiff?|woff2?|ttf|otf|eot|mp[34]|mov|webm|wav|ogg|pdf|zip|gz|tgz|tar|7z|rar|jar|wasm|exe|dll|so|dylib|bin|lockb|psd|sketch|fig)$/i;

export class GitHubError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "WebGuard",
  };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new GitHubError("Repository not found. Check the name, or make sure it is public.", 404);
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError("GitHub rate limit reached. Add a GITHUB_TOKEN or try again later.", res.status);
  }
  if (res.status === 422) throw new GitHubError("Branch or commit not found", 422);
  if (!res.ok) throw new GitHubError(`GitHub API error (${res.status})`, res.status);
  return res.json() as Promise<T>;
}

export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input.trim().replace(/\.git$/, "").match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

interface RepoMeta {
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  homepage: string | null;
  description: string | null;
}

export async function getRepoMeta(owner: string, repo: string) {
  return gh<RepoMeta>(`/repos/${owner}/${repo}`);
}

/** Light-weight file listing + package.json for stack detection during onboarding. */
export async function getRepoOverview(owner: string, repo: string) {
  const meta = await getRepoMeta(owner, repo);
  const tree = await gh<{ tree: { path: string; type: string }[] }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`,
  );
  const paths = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
  let packageJson: string | undefined;
  if (paths.includes("package.json")) {
    const f = await gh<{ content: string }>(`/repos/${owner}/${repo}/contents/package.json?ref=${encodeURIComponent(meta.default_branch)}`);
    packageJson = Buffer.from(f.content, "base64").toString("utf8");
  }
  return { meta, paths, packageJson };
}

export async function fetchSnapshot(owner: string, repo: string, branch?: string): Promise<RepoSnapshot> {
  const meta = await getRepoMeta(owner, repo);
  let ref = branch || meta.default_branch;
  type CommitRes = { sha: string; commit: { message: string; author: { name: string } | null }; author: { login: string } | null };
  let commit: CommitRes;
  try {
    commit = await gh<CommitRes>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  } catch (e) {
    // 404/422 = branch does not exist; fall back to the default branch.
    if (!(e instanceof GitHubError) || ![404, 422].includes(e.status ?? 0) || ref === meta.default_branch) throw e;
    ref = meta.default_branch;
    commit = await gh<CommitRes>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  }

  const res = await fetch(`${API}/repos/${owner}/${repo}/tarball/${commit.sha}`, {
    headers: headers(),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new GitHubError(`Could not download repository (${res.status})`, res.status);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_TARBALL_BYTES) throw new GitHubError("Repository is too large to scan (over 60 MB compressed)");
  const gz = Buffer.from(await res.arrayBuffer());
  if (gz.byteLength > MAX_TARBALL_BYTES) throw new GitHubError("Repository is too large to scan (over 60 MB compressed)");

  const { files, allPaths } = untar(gunzipSync(gz, { maxOutputLength: 512 * 1024 * 1024 }));
  return {
    owner,
    repo,
    ref,
    commit: {
      sha: commit.sha.slice(0, 7),
      message: commit.commit.message.split("\n")[0].slice(0, 140),
      author: commit.author?.login ?? commit.commit.author?.name ?? "unknown",
    },
    files,
    allPaths,
  };
}

/** Minimal ustar/pax reader. GitHub tarballs wrap everything in a "<owner>-<repo>-<sha>/" root dir. */
function untar(buf: Buffer): { files: RepoFile[]; allPaths: string[] } {
  const files: RepoFile[] = [];
  const allPaths: string[] = [];
  let offset = 0;
  let paxPath: string | undefined;

  const str = (start: number, len: number) => {
    const s = buf.subarray(start, start + len);
    const nul = s.indexOf(0);
    return s.subarray(0, nul === -1 ? len : nul).toString("utf8");
  };

  while (offset + 512 <= buf.length) {
    const header = offset;
    if (buf[header] === 0) break; // end-of-archive
    const name = str(header, 100);
    const size = parseInt(str(header + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(buf[header + 156] || 48);
    const prefix = str(header + 345, 155);
    const dataStart = header + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === "x") {
      const m = data.toString("utf8").match(/\d+ path=([^\n]*)\n/);
      paxPath = m?.[1];
      continue;
    }
    if (type === "g") continue;
    const full = paxPath ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = undefined;
    if (type !== "0" && type !== "\0") continue; // regular files only (no symlinks)

    const path = full.split("/").slice(1).join("/"); // drop root dir
    if (!path) continue;
    allPaths.push(path);
    const isLockfile = /(^|\/)package-lock\.json$/.test(path);
    const maxSize = isLockfile ? MAX_LOCKFILE_BYTES : MAX_FILE_BYTES;
    if (files.length >= MAX_FILES || size > maxSize || SKIP_DIRS.test(path) || BINARY_EXT.test(path)) continue;
    if (data.includes(0)) continue; // binary
    files.push({ path, content: data.toString("utf8") });
  }
  return { files, allPaths };
}

export interface RepoSummary {
  fullName: string;
  description: string | null;
  language: string | null;
  pushedAt: string;
  fork: boolean;
}

/** Public repos owned by a GitHub user, most recently pushed first. */
export async function listPublicRepos(login: string): Promise<RepoSummary[]> {
  type Raw = { full_name: string; description: string | null; language: string | null; pushed_at: string; fork: boolean; archived: boolean };
  const repos = await gh<Raw[]>(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`);
  return repos
    .filter((r) => !r.archived)
    .map((r) => ({ fullName: r.full_name, description: r.description, language: r.language, pushedAt: r.pushed_at, fork: r.fork }));
}
