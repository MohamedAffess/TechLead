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

describe("records and setup", () => {
  const owner: Member = { id: "m1", workspaceId: "w1", role: "owner", displayName: "Owner" };
  /** A stand-in for the Supabase query builder: every call chains, and awaiting it gives `result`. */
  const fakeDb = (result: { data: unknown; error: null }) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "update", "insert", "eq", "order", "single"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain as never;
  };
  const json = { "Content-Type": "application/json", Authorization: "Bearer x" };

  it("speaks camelCase", async () => {
    const { camel } = await import("./app.js");
    expect(camel({ owner_member_id: "m1", jira_key: null, title: "t" })).toEqual({ ownerMemberId: "m1", jiraKey: null, title: "t" });
  });

  it("refuses a status change the database filtered out", async () => {
    const app = createApp({ resolveMember: async () => ({ member: teamMember, db: fakeDb({ data: [], error: null }) }) });
    const res = await app.request("/v1/tasks/t1", { method: "PATCH", headers: json, body: JSON.stringify({ status: "done" }) });
    expect(res.status).toBe(403);
  });

  it("returns the updated task in camelCase", async () => {
    const app = createApp({ resolveMember: async () => ({ member: owner, db: fakeDb({ data: [{ id: "t1", owner_member_id: null, status: "done" }], error: null }) }) });
    const res = await app.request("/v1/tasks/t1", { method: "PATCH", headers: json, body: JSON.stringify({ status: "done" }) });
    expect(await res.json()).toEqual({ id: "t1", ownerMemberId: null, status: "done" });
  });

  it("explains how to turn on AI drafting when no key is set", async () => {
    const app = createApp({ resolveMember: async () => ({ member: owner, db: {} as never }) });
    const res = await app.request("/v1/workspace/draft", { method: "POST", headers: json, body: JSON.stringify({ companyName: "Infor", aboutMe: "I lead three solutions as architect." }) });
    expect(res.status).toBe(503);
  });

  it("passes the description to the drafter", async () => {
    const app = createApp({
      resolveMember: async () => ({ member: owner, db: {} as never }),
      draftProfile: async (input) => ({ profile: `About ${input.companyName}`, focus: "f", solutions: [] }),
    });
    const res = await app.request("/v1/workspace/draft", { method: "POST", headers: json, body: JSON.stringify({ companyName: "Infor", aboutMe: "I lead three solutions as architect." }) });
    expect(await res.json()).toMatchObject({ profile: "About Infor" });
  });

  it("keeps company settings owner-only", async () => {
    const app = createApp({ resolveMember: async () => ({ member: teamMember, db: {} as never }) });
    const res = await app.request("/v1/workspace", { method: "PATCH", headers: json, body: JSON.stringify({ focus: "x" }) });
    expect(res.status).toBe(403);
  });
});
