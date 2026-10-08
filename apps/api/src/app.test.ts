import { describe, expect, it } from "vitest";
import { createApp, type Member } from "./app.js";
import { recordFromProposal } from "./records.js";

const teamMember: Member = { id: "m2", workspaceId: "w1", role: "team", displayName: "Team" };

function appFor(member: Member | null) {
  return createApp({
    resolveMember: async () => (member ? { member, db: {} as never } : null),
  });
}

describe("api", () => {
  it("answers health checks without signing in", async () => {
    const res = await appFor(null).request("/health");
    expect(res.status).toBe(200);
  });

  it("asks for a token", async () => {
    const res = await appFor(null).request("/v1/solutions");
    expect(res.status).toBe(401);
  });

  it("refuses people who are not members", async () => {
    const res = await appFor(null).request("/v1/solutions", { headers: { Authorization: "Bearer x" } });
    expect(res.status).toBe(403);
  });

  it("keeps the AI inbox away from team members", async () => {
    const res = await appFor(teamMember).request("/v1/proposals", { headers: { Authorization: "Bearer x" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the workspace owner can do this." });
  });
});

describe("recordFromProposal", () => {
  const base = { id: "p1", workspace_id: "w1", source_id: "s1", solution_id: null };

  it("numbers decisions and keeps the chosen visibility and source", () => {
    const r = recordFromProposal(
      { ...base, draft: { kind: "decision", title: "Use pgvector", status: "proposed", context: "c", decision: "d", consequences: "e" } },
      "team",
      7,
    );
    expect(r.table).toBe("decisions");
    expect(r.row).toMatchObject({ number: 7, visibility: "team", source_id: "s1" });
  });

  it("starts accepted tasks in To do", () => {
    const r = recordFromProposal({ ...base, draft: { kind: "task", title: "Get cost numbers", ownerName: "Ben", due: null, priority: "P2" } }, "private", 1);
    expect(r).toMatchObject({ table: "tasks", row: { status: "todo", visibility: "private" } });
  });
});
