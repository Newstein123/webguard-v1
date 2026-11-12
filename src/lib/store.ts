"use client";

import { create } from "zustand";
import { supabaseBrowser } from "./supabase/client";
import { toFinding, toProject, toScan, type FindingRow, type ProjectRow, type ScanRow } from "./db";
import type { Finding, MonitoringSettings, Project, Scan } from "./types";

export interface NewProjectInput {
  name: string;
  source: "url" | "github";
  url?: string;
  repo?: string;
  branch?: string;
  stack: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface State {
  status: "idle" | "loading" | "ready" | "error";
  user: CurrentUser | null;
  projects: Project[];
  scans: Scan[];
  findings: Finding[];
}

interface Actions {
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  createProject: (input: NewProjectInput) => Promise<{ projectId: string; scanId: string }>;
  startScan: (projectId: string) => Promise<{ scanId: string }>;
  ignoreFinding: (findingId: string, reason: string) => Promise<void>;
  reopenFinding: (findingId: string) => Promise<void>;
  updateMonitoring: (projectId: string, patch: Partial<MonitoringSettings>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** Unwrap a Supabase response; rows are narrowed to our domain row types here. */
function check<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const useStore = create<State & Actions>()((set, get) => ({
  status: "idle",
  user: null,
  projects: [],
  scans: [],
  findings: [],

  load: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const { data } = await supabaseBrowser().auth.getUser();
      const u = data.user;
      if (u) {
        const meta = u.user_metadata ?? {};
        set({
          user: {
            id: u.id,
            email: u.email ?? "",
            name: meta.user_name ?? meta.full_name ?? u.email?.split("@")[0] ?? "You",
            avatarUrl: meta.avatar_url,
          },
        });
      }
      await get().refresh();
      set({ status: "ready" });
    } catch (e) {
      console.error(e);
      set({ status: "error" });
    }
  },

  refresh: async () => {
    const sb = supabaseBrowser();
    const [p, s, f] = await Promise.all([
      sb.from("projects").select("*").order("created_at", { ascending: false }),
      sb.from("scans").select("*").order("started_at", { ascending: false }).limit(1000),
      sb.from("findings").select("*"),
    ]);
    set({
      projects: check<ProjectRow[]>(p).map(toProject),
      scans: check<ScanRow[]>(s).map(toScan),
      findings: check<FindingRow[]>(f).map(toFinding),
    });
  },

  createProject: async (input) => {
    const res = await api<{ projectId: string; scanId: string }>("/api/projects", { method: "POST", body: JSON.stringify(input) });
    await get().refresh();
    return res;
  },

  startScan: async (projectId) => {
    const res = await api<{ scanId: string }>(`/api/projects/${projectId}/scans`, { method: "POST", body: JSON.stringify({ trigger: "manual" }) });
    await get().refresh();
    return res;
  },

  ignoreFinding: async (findingId, reason) => {
    check(await supabaseBrowser().from("findings").update({ status: "ignored", ignored_reason: reason || null }).eq("id", findingId).select());
    set({ findings: get().findings.map((f) => (f.id === findingId ? { ...f, status: "ignored", ignoredReason: reason || undefined } : f)) });
  },

  reopenFinding: async (findingId) => {
    check(await supabaseBrowser().from("findings").update({ status: "open" }).eq("id", findingId).select());
    set({ findings: get().findings.map((f) => (f.id === findingId ? { ...f, status: "open", ignoredReason: undefined } : f)) });
  },

  updateMonitoring: async (projectId, patch) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    const monitoring = { ...project.monitoring, ...patch };
    check(await supabaseBrowser().from("projects").update({ monitoring }).eq("id", projectId).select());
    set({ projects: get().projects.map((p) => (p.id === projectId ? { ...p, monitoring } : p)) });
  },

  deleteProject: async (projectId) => {
    check(await supabaseBrowser().from("projects").delete().eq("id", projectId).select());
    set({
      projects: get().projects.filter((p) => p.id !== projectId),
      scans: get().scans.filter((s) => s.projectId !== projectId),
      findings: get().findings.filter((f) => f.projectId !== projectId),
    });
  },

  signOut: async () => {
    await supabaseBrowser().auth.signOut();
    set({ status: "idle", user: null, projects: [], scans: [], findings: [] });
  },

  deleteAccount: async () => {
    await api("/api/account", { method: "DELETE" });
    set({ status: "idle", user: null, projects: [], scans: [], findings: [] });
  },
}));
