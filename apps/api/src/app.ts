import { canReviewProposals, Solution, VISIBILITIES, type Role } from "@techlead/shared";
import type { SupabaseClient } from "@techlead/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { recordFromProposal, type ProposalRow } from "./records.js";

export type Member = { id: string; workspaceId: string; role: Role; displayName: string };

export type Deps = {
  /**
   * Checks the bearer token and returns the caller's membership plus a
   * database client that acts as them (row-level security applies).
   */
  resolveMember(accessToken: string): Promise<{ member: Member; db: SupabaseClient } | null>;
  allowedOrigins?: string[];
};

type Env = { Variables: { member: Member; db: SupabaseClient } };

export function createApp(deps: Deps) {
  const app = new Hono<Env>();

  app.use("*", cors({ origin: deps.allowedOrigins ?? "*", allowHeaders: ["Authorization", "Content-Type"] }));

  app.get("/health", (c) => c.json({ ok: true }));

  // Everything below needs a signed-in member.
  app.use("/v1/*", async (c, next) => {
    const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new HTTPException(401, { message: "Sign in first." });
    const resolved = await deps.resolveMember(token);
    if (!resolved) throw new HTTPException(403, { message: "You are not a member of this workspace." });
    c.set("member", resolved.member);
    c.set("db", resolved.db);
    await next();
  });

  const ownerOnly = (role: Role) => {
    if (!canReviewProposals(role)) throw new HTTPException(403, { message: "Only the workspace owner can do this." });
  };

  app.get("/v1/me", (c) => c.json(c.get("member")));

  app.get("/v1/solutions", async (c) => {
    const { data, error } = await c.get("db").from("solutions").select("*").order("created_at");
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json(data);
  });

  app.post("/v1/solutions", async (c) => {
    ownerOnly(c.get("member").role);
    const input = Solution.omit({ id: true }).parse(await c.req.json());
    const { data, error } = await c
      .get("db")
      .from("solutions")
      .insert({ ...input, workspace_id: c.get("member").workspaceId })
      .select()
      .single();
    if (error) throw new HTTPException(400, { message: error.message });
    return c.json(data, 201);
  });

  app.get("/v1/tasks", async (c) => {
    let query = c.get("db").from("tasks").select("*").order("created_at", { ascending: false });
    const solutionId = c.req.query("solutionId");
    if (solutionId) query = query.eq("solution_id", solutionId);
    const { data, error } = await query;
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json(data);
  });

  // A written note goes into the AI pipeline like a transcript does.
  app.post("/v1/sources/notes", async (c) => {
    ownerOnly(c.get("member").role);
    const input = z.object({ title: z.string().min(1), text: z.string().min(1), solutionId: z.string().uuid().nullable() }).parse(await c.req.json());
    const { data, error } = await c
      .get("db")
      .from("sources")
      .insert({ workspace_id: c.get("member").workspaceId, kind: "note", title: input.title, body: input.text, solution_id: input.solutionId })
      .select()
      .single();
    if (error) throw new HTTPException(400, { message: error.message });
    return c.json(data, 201);
  });

  app.get("/v1/proposals", async (c) => {
    ownerOnly(c.get("member").role);
    const { data, error } = await c.get("db").from("proposals").select("*, source:sources(title, kind)").eq("state", "pending").order("created_at");
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json(data);
  });

  app.post("/v1/proposals/:id/accept", async (c) => {
    ownerOnly(c.get("member").role);
    const { visibility } = z.object({ visibility: z.enum(VISIBILITIES) }).parse(await c.req.json());
    const db = c.get("db");
    const { data: proposal, error } = await db.from("proposals").select("*").eq("id", c.req.param("id")).eq("state", "pending").single();
    if (error || !proposal) throw new HTTPException(404, { message: "That proposal is gone or already reviewed." });

    let next = 1;
    if ((proposal as ProposalRow).draft.kind === "decision") {
      const { data: last } = await db.from("decisions").select("number").order("number", { ascending: false }).limit(1).maybeSingle();
      next = ((last as { number: number } | null)?.number ?? 0) + 1;
    }
    const record = recordFromProposal(proposal as ProposalRow, visibility, next);
    const { data: created, error: insertError } = await db.from(record.table).insert(record.row).select().single();
    if (insertError) throw new HTTPException(400, { message: insertError.message });
    await db.from("proposals").update({ state: "accepted" }).eq("id", proposal.id);
    return c.json({ table: record.table, record: created }, 201);
  });

  app.post("/v1/proposals/:id/reject", async (c) => {
    ownerOnly(c.get("member").role);
    const { error } = await c.get("db").from("proposals").update({ state: "rejected" }).eq("id", c.req.param("id"));
    if (error) throw new HTTPException(400, { message: error.message });
    return c.body(null, 204);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return c.json({ error: "Some fields are missing or invalid.", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong on our side." }, 500);
  });

  return app;
}

