import { describe, expect, it, vi } from "vitest";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "c2lnbmF0dXJlc2lnbmF0dXJl"].join(".");

const SERVICE = jwt({ iss: "supabase", role: "service_role" });
const pages: Record<string, string> = {
  "https://app.test/assets/index-abc.js": `const s=createClient("https://xyz.supabase.co","${SERVICE}");`,
  "https://cdn.other.test/lib.js": `"${["sk", "live", "51HcAbCdEfGhIjKlMnOpQrStUv"].join("_")}"`,
};

vi.mock("../http", () => ({
  safeFetch: vi.fn(async (url: string) => ({ url, status: 200, headers: new Headers(), body: pages[url] ?? "", truncated: false })),
}));

const { analyzeBundles, analyzeHeaders } = await import("../analyzers/site");

const page = {
  url: "https://app.test/",
  status: 200,
  headers: new Headers({ "x-vercel-id": "1", "strict-transport-security": "max-age=1" }),
  body: `<html><script type="module" src="/assets/index-abc.js"></script><script src="https://cdn.other.test/lib.js"></script></html>`,
  truncated: false,
};

describe("site analyzers", () => {
  it("finds a service_role key in the site's own bundle and skips third-party scripts", async () => {
    const r = await analyzeBundles(page);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].ruleId).toBe("supabase-service-role-exposed");
    expect(r.findings[0].location).toBe("https://app.test/assets/index-abc.js");
    expect(r.findings[0].evidence).not.toContain(SERVICE);
    expect(r.stackHints).toContain("Supabase");
  });

  it("reports missing headers and detects Vercel", () => {
    const r = analyzeHeaders(page);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe("medium");
    expect(r.findings[0].evidence).toContain("✗ missing  Content-Security-Policy");
    expect(r.findings[0].evidence).toContain("✓ present  Strict-Transport-Security");
    expect(r.stackHints).toContain("Vercel");
  });
});
