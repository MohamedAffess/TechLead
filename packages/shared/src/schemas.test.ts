import { describe, expect, it } from "vitest";
import { ProposalDraft } from "./schemas.js";

describe("ProposalDraft", () => {
  it("accepts a task proposal", () => {
    const parsed = ProposalDraft.parse({ kind: "task", title: "Review SSO design", ownerName: null, due: "2026-10-20", priority: "P1" });
    expect(parsed.kind).toBe("task");
  });

  it("rejects a malformed due date", () => {
    expect(() => ProposalDraft.parse({ kind: "task", title: "x", ownerName: null, due: "20/10/2026", priority: "P1" })).toThrow();
  });
});
