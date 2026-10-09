import { canReviewProposals, Priority, Solution, TaskStatus, VISIBILITIES, type Role } from "@techlead/shared";
import type { SupabaseClient } from "@techlead/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { integrationRoutes, type IntegrationsConfig } from "./integrations.js";
import { recordFromProposal, type ProposalRow } from "./records.js";

export type Member = { id: string; workspaceId: string; role: Role; displayName: string };

export type Deps = {
  /**
   * Checks the bearer token and returns the caller's membership plus a
   * database client that acts as them (row-level security applies).
   */
  resolveMember(accessToken: string): Promise<{ member: Member; db: SupabaseClient } | null>;
  allowedOrigins?: string[];
  /** Jira and Microsoft connections. Left out, those routes answer 503. */
  integrations?: IntegrationsConfig;
  /** Drafts the company profile with Claude. Left out (no API key), that route answers 503. */
  draftProfile?: (input: { companyName: string; aboutMe: string }) => Promise<{ profile: string; focus: string; solutions: { name: string; summary: string }[] }>;
};

/** Database rows use snake_case; the API speaks the camelCase of @techlead/shared. */
export function camel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()), v]));
}
const camelAll = (rows: Record<string, unknown>[] | null) => (rows ?? []).map(camel);

export type Env = { Variables: { member: Member; db: SupabaseClient } };

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
    return c.json(camelAll(data));
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
    return c.json(camel(data), 201);
  });

  // Lists of records. Row-level security decides which rows each role gets back.
  for (const [path, table, order] of [
    ["tasks", "tasks", "created_at"],
    ["decisions", "decisions", "number"],
    ["risks", "risks", "created_at"],
    ["team-statuses", "team_statuses", "as_of"],
  ] as const) {
    app.get(`/v1/${path}`, async (c) => {
      let query = c.get("db").from(table).select("*").order(order, { ascending: false });
      const solutionId = c.req.query("solutionId");
      if (solutionId) query = query.eq("solution_id", solutionId);
      const { data, error } = await query;
      if (error) throw new HTTPException(500, { message: error.message });
      return c.json(camelAll(data));
    });
  }

  app.post("/v1/tasks", async (c) => {
    ownerOnly(c.get("member").role);
    const input = z
      .object({
        title: z.string().min(1),
        priority: Priority.default("P2"),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        solutionId: z.string().uuid().nullable().default(null),
        visibility: z.enum(VISIBILITIES).default("private"),
      })
      .parse(await c.req.json());
    const { data, error } = await c
      .get("db")
      .from("tasks")
      .insert({ workspace_id: c.get("member").workspaceId, title: input.title, priority: input.priority, due: input.due, solution_id: input.solutionId, visibility: input.visibility })
      .select()
      .single();
    if (error) throw new HTTPException(400, { message: error.message });
    return c.json(camel(data), 201);
  });

  // The owner moves any task; a team member moves only their own (row-level security enforces it).
  app.patch("/v1/tasks/:id", async (c) => {
    const { status } = z.object({ status: TaskStatus }).parse(await c.req.json());
    const { data, error } = await c.get("db").from("tasks").update({ status }).eq("id", c.req.param("id")).select();
    if (error) throw new HTTPException(400, { message: error.message });
    if (!data?.length) throw new HTTPException(403, { message: "You can only update your own tasks." });
    return c.json(camel(data[0]!));
  });

  app.get("/v1/workspace", async (c) => {
    const { data, error } = await c.get("db").from("workspaces").select("id, company_name, profile, focus").eq("id", c.get("member").workspaceId).single();
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json(camel(data));
  });

  app.patch("/v1/workspace", async (c) => {
    ownerOnly(c.get("member").role);
    const input = z.object({ companyName: z.string().min(1), profile: z.string(), focus: z.string() }).partial().parse(await c.req.json());
    const row = Object.fromEntries(
      Object.entries({ company_name: input.companyName, profile: input.profile, focus: input.focus }).filter(([, v]) => v !== undefined),
    );
    const { data, error } = await c.get("db").from("workspaces").update(row).eq("id", c.get("member").workspaceId).select("id, company_name, profile, focus").single();
    if (error) throw new HTTPException(400, { message: error.message });
    return c.json(camel(data));
  });

  // Claude drafts the company context from a short description; the owner edits it before saving.
  app.post("/v1/workspace/draft", async (c) => {
    ownerOnly(c.get("member").role);
    if (!deps.draftProfile) throw new HTTPException(503, { message: "Add ANTHROPIC_API_KEY to the API to use AI drafting." });
    const input = z.object({ companyName: z.string().min(1), aboutMe: z.string().min(20, "Tell the AI a little more about your work.") }).parse(await c.req.json());
    return c.json(await deps.draftProfile(input));
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
    return c.json(camel(data), 201);
  });

  app.get("/v1/proposals", async (c) => {
    ownerOnly(c.get("member").role);
    const { data, error } = await c.get("db").from("proposals").select("*, source:sources(title, kind)").eq("state", "pending").order("created_at");
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json(camelAll(data));
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
    return c.json({ table: record.table, record: camel(created) }, 201);
  });

  app.post("/v1/proposals/:id/reject", async (c) => {
    ownerOnly(c.get("member").role);
    const { error } = await c.get("db").from("proposals").update({ state: "rejected" }).eq("id", c.req.param("id"));
    if (error) throw new HTTPException(400, { message: error.message });
    return c.body(null, 204);
  });

  integrationRoutes(app, deps.integrations);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return c.json({ error: "Some fields are missing or invalid.", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong on our side." }, 500);
  });

  return app;
}

