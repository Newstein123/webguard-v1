import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FixAllPanel } from "./fix-all-panel";
import { finding } from "@/lib/__tests__/fixtures";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("FixAllPanel", () => {
  it("summarises what the prompt covers and offers Copy Instructions", () => {
    const t = text(renderToStaticMarkup(<FixAllPanel findings={[finding(), finding({ id: "f2", location: "x → public.todos" })]} mode="normal" filtered />));
    expect(t).toContain("Fix all with AI");
    expect(t).toContain("2 open issues in 1 group matching your filters");
    expect(t).toContain("Copy Instructions");
  });

  it("explains when there is nothing open", () => {
    const t = text(renderToStaticMarkup(<FixAllPanel findings={[finding({ status: "resolved" })]} mode="normal" filtered={false} />));
    expect(t).toContain("No open issues to fix");
    expect(t).not.toContain("Copy Instructions");
  });
});
