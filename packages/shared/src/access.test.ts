import { describe, expect, it } from "vitest";
import { canEdit, canReviewProposals, canView } from "./access.js";

describe("canView", () => {
  it("keeps private items to the owner", () => {
    expect(canView("owner", "private")).toBe(true);
    expect(canView("team", "private")).toBe(false);
    expect(canView("guest", "private")).toBe(false);
  });

  it("shows team items to owner and team, not guests", () => {
    expect(canView("team", "team")).toBe(true);
    expect(canView("guest", "team")).toBe(false);
  });

  it("shows guest items to everyone", () => {
    expect(canView("guest", "guest")).toBe(true);
  });
});

describe("canEdit", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("lets team members edit only their own team tasks", () => {
    expect(canEdit("team", me, { kind: "task", visibility: "team", ownerMemberId: me })).toBe(true);
    expect(canEdit("team", me, { kind: "task", visibility: "team", ownerMemberId: other })).toBe(false);
    expect(canEdit("team", me, { kind: "task", visibility: "private", ownerMemberId: me })).toBe(false);
    expect(canEdit("team", me, { kind: "decision", visibility: "team", ownerMemberId: me })).toBe(false);
  });

  it("never lets guests edit", () => {
    expect(canEdit("guest", me, { kind: "task", visibility: "guest", ownerMemberId: me })).toBe(false);
  });

  it("reserves the AI inbox for the owner", () => {
    expect(canReviewProposals("owner")).toBe(true);
    expect(canReviewProposals("team")).toBe(false);
  });
});
