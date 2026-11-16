import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal in-memory Supabase double: just the calls the store makes. */
const db = vi.hoisted(() => ({
  user: { id: "u1", email: "dev@example.com", user_metadata: {} } as Record<string, unknown> | null,
  settings: null as { user_id: string; developer_mode: boolean; updated_at: string } | null,
  settingsError: null as { message: string } | null,
  upsertError: null as { message: string } | null,
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[],
}));

vi.mock("./supabase/client", () => {
  const query = (table: string) => {
    const result = () =>
      table === "user_settings" ? { data: db.settings, error: db.settingsError } : { data: [], error: null };
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: () => q,
      maybeSingle: async () => result(),
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        db.upserts.push({ row, opts });
        if (!db.upsertError) db.settings = { user_id: "u1", developer_mode: Boolean(row.developer_mode), updated_at: "" };
        return { error: db.upsertError };
      },
      then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err),
    };
    return q;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: db.user } }), signOut: async () => ({}) },
    from: query,
  };
  return { supabaseBrowser: () => client };
});

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const { useStore } = await import("./store");

beforeEach(() => {
  storage.clear();
  Object.assign(db, { settings: null, settingsError: null, upsertError: null, upserts: [] });
  useStore.setState({ status: "idle", user: null, projects: [], scans: [], findings: [], developerMode: false });
});

describe("Developer Mode preference", () => {
  it("is off by default for a new user", async () => {
    await useStore.getState().load();
    expect(useStore.getState().developerMode).toBe(false);
  });

  it("is restored from the account on load (new browser, empty cache)", async () => {
    db.settings = { user_id: "u1", developer_mode: true, updated_at: "" };
    await useStore.getState().load();
    expect(useStore.getState().developerMode).toBe(true);
    expect(storage.get("webguard-developer-mode")).toBe("1");
  });

  it("prefers the account value over a stale device cache", async () => {
    storage.set("webguard-developer-mode", "1");
    db.settings = { user_id: "u1", developer_mode: false, updated_at: "" };
    await useStore.getState().load();
    expect(useStore.getState().developerMode).toBe(false);
  });

  it("falls back to the device cache if account settings cannot be read", async () => {
    storage.set("webguard-developer-mode", "1");
    db.settingsError = { message: "relation does not exist" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await useStore.getState().load();
    expect(useStore.getState().developerMode).toBe(true);
    expect(useStore.getState().status).toBe("ready");
  });

  it("persists a change to the account and the device, and survives a reload", async () => {
    await useStore.getState().load();
    await useStore.getState().setDeveloperMode(true);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].row).toMatchObject({ developer_mode: true });
    expect(db.upserts[0].row).not.toHaveProperty("user_id"); // set server-side by auth.uid()
    expect(db.upserts[0].opts).toEqual({ onConflict: "user_id" });
    expect(storage.get("webguard-developer-mode")).toBe("1");

    // Simulate a refresh / new session.
    storage.clear();
    useStore.setState({ status: "idle", developerMode: false });
    await useStore.getState().load();
    expect(useStore.getState().developerMode).toBe(true);
  });

  it("switching modes leaves findings, scans and projects untouched", async () => {
    await useStore.getState().load();
    const findings = [{ id: "f1" }] as never[];
    useStore.setState({ findings });
    const before = useStore.getState();
    await useStore.getState().setDeveloperMode(true);
    await useStore.getState().setDeveloperMode(false);
    const after = useStore.getState();
    expect(after.findings).toBe(before.findings);
    expect(after.scans).toBe(before.scans);
    expect(after.projects).toBe(before.projects);
  });

  it("keeps the change on this device and reports when the account save fails", async () => {
    await useStore.getState().load();
    db.upsertError = { message: "permission denied" };
    await expect(useStore.getState().setDeveloperMode(true)).rejects.toThrow(/this device only/);
    expect(useStore.getState().developerMode).toBe(true);
    expect(storage.get("webguard-developer-mode")).toBe("1");
  });

  it("saves rapid toggles in order, so the last choice wins", async () => {
    await useStore.getState().load();
    const s = useStore.getState();
    await Promise.all([s.setDeveloperMode(true), s.setDeveloperMode(false), s.setDeveloperMode(true)]);
    expect(db.upserts.map((u) => u.row.developer_mode)).toEqual([true, false, true]);
    expect(db.settings?.developer_mode).toBe(true);
  });

  it("resets to off on sign-out so the next user starts from their own setting", async () => {
    await useStore.getState().load();
    await useStore.getState().setDeveloperMode(true);
    await useStore.getState().signOut();
    expect(useStore.getState().developerMode).toBe(false);
  });
});
