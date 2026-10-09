import { canManageIntegrations, type Role } from "@techlead/shared";
import { accessibleSites, exchangeJiraCode, jiraAuthorizeUrl, listProjects, refreshJiraToken } from "@techlead/sync";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "./app.js";

export type Provider = "jira" | "microsoft";

export type TokenRow = {
  workspace_id: string;
  provider: Provider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  meta: Record<string, unknown>;
};

/**
 * Where sign-in tokens for Jira and Microsoft are kept. The table has no
 * row-level security policies, so only the server (service role) can use it.
 */
export type TokenStore = {
  get(workspaceId: string, provider: Provider): Promise<TokenRow | null>;
  save(row: TokenRow): Promise<void>;
  remove(workspaceId: string, provider: Provider): Promise<void>;
};

export type IntegrationsConfig = {
  tokens: TokenStore;
  /** Signs the OAuth state so a callback can only come from a flow the owner started. */
  stateSecret: string;
  /** The web app, where the owner lands after connecting. */
  webUrl: string;
  jira?: { clientId: string; clientSecret: string; redirectUri: string };
  fetch?: typeof fetch;
};

const STATE_TTL_MS = 10 * 60_000;

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

export async function signState(secret: string, workspaceId: string, now = Date.now()): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ w: workspaceId, e: now + STATE_TTL_MS })));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the workspace id the state was issued for, or null if it is forged or expired. */
export async function verifyState(secret: string, state: string, now = Date.now()): Promise<string | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || sig !== (await hmac(secret, payload))) return null;
  try {
    const { w, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { w: string; e: number };
    return e > now ? w : null;
  } catch {
    return null;
  }
}

/** A Jira access token that is valid for at least another minute. */
async function jiraAccess(cfg: IntegrationsConfig, workspaceId: string) {
  const row = await cfg.tokens.get(workspaceId, "jira");
  if (!row) return null;
  const meta = row.meta as { cloudId: string; siteUrl: string; siteName: string };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000 && row.refresh_token && cfg.jira) {
    const fresh = await refreshJiraToken({ clientId: cfg.jira.clientId, clientSecret: cfg.jira.clientSecret, refreshToken: row.refresh_token }, cfg.fetch);
    await cfg.tokens.save({ ...row, access_token: fresh.accessToken, refresh_token: fresh.refreshToken, expires_at: fresh.expiresAt });
    return { accessToken: fresh.accessToken, ...meta };
  }
  return { accessToken: row.access_token, ...meta };
}

export function integrationRoutes(app: Hono<Env>, cfg: IntegrationsConfig | undefined) {
  const need = (role: Role) => {
    if (!canManageIntegrations(role)) throw new HTTPException(403, { message: "Only the workspace owner can do this." });
    if (!cfg) throw new HTTPException(503, { message: "Integrations are not set up on the server yet. See docs/DEPLOYMENT.md." });
    return cfg;
  };
  const needJira = (role: Role) => {
    const c = need(role);
    if (!c.jira) throw new HTTPException(503, { message: "The Jira app is not set up on the server yet. See docs/DEPLOYMENT.md." });
    return c as IntegrationsConfig & { jira: NonNullable<IntegrationsConfig["jira"]> };
  };

  app.get("/v1/integrations", async (c) => {
    const config = need(c.get("member").role);
    const ws = c.get("member").workspaceId;
    const [jira, microsoft] = await Promise.all([config.tokens.get(ws, "jira"), config.tokens.get(ws, "microsoft")]);
    return c.json({
      jira: { available: Boolean(config.jira), connected: Boolean(jira), site: (jira?.meta.siteName as string | undefined) ?? null },
      microsoft: { connected: Boolean(microsoft), lastSyncedAt: (microsoft?.meta.lastSyncedAt as string | undefined) ?? null },
    });
  });

  // Step 1: the web app asks for the Atlassian consent link and sends the owner there.
  app.post("/v1/integrations/jira/connect", async (c) => {
    const config = needJira(c.get("member").role);
    const state = await signState(config.stateSecret, c.get("member").workspaceId);
    return c.json({ url: jiraAuthorizeUrl({ clientId: config.jira.clientId, redirectUri: config.jira.redirectUri, state }) });
  });

  // Step 2: Atlassian sends the owner back here. No bearer token on this request; the signed state proves who started it.
  app.get("/integrations/jira/callback", async (c) => {
    if (!cfg?.jira) return c.text("The Jira app is not set up on the server.", 503);
    const back = (result: string) => c.redirect(`${cfg.webUrl}/?jira=${result}`);
    const code = c.req.query("code");
    const workspaceId = await verifyState(cfg.stateSecret, c.req.query("state") ?? "");
    if (!code || !workspaceId) return back("denied");
    try {
      const tokens = await exchangeJiraCode({ ...cfg.jira, code }, cfg.fetch);
      const [site] = await accessibleSites(tokens.accessToken, cfg.fetch);
      if (!site) return back("no-site");
      await cfg.tokens.save({
        workspace_id: workspaceId,
        provider: "jira",
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        meta: { cloudId: site.cloudId, siteUrl: site.url, siteName: site.name },
      });
      return back("connected");
    } catch (err) {
      console.error(err);
      return back("error");
    }
  });

  // Step 3: the owner picks which Jira projects to follow, and optionally which solution each one feeds.
  app.get("/v1/integrations/jira/projects", async (c) => {
    const config = needJira(c.get("member").role);
    const access = await jiraAccess(config, c.get("member").workspaceId);
    if (!access) throw new HTTPException(409, { message: "Connect Jira first." });
    const [available, { data: selected, error }] = await Promise.all([
      listProjects({ accessToken: access.accessToken, cloudId: access.cloudId }, config.fetch),
      c.get("db").from("jira_projects").select("jira_project_key, solution_id").eq("jira_site", access.siteUrl),
    ]);
    if (error) throw new HTTPException(500, { message: error.message });
    const picked = new Map((selected ?? []).map((s: { jira_project_key: string; solution_id: string | null }) => [s.jira_project_key, s.solution_id]));
    return c.json(available.map((p) => ({ key: p.key, name: p.name, selected: picked.has(p.key), solutionId: picked.get(p.key) ?? null })));
  });

  app.put("/v1/integrations/jira/projects", async (c) => {
    const config = needJira(c.get("member").role);
    const ws = c.get("member").workspaceId;
    const { projects } = z
      .object({ projects: z.array(z.object({ key: z.string().min(1), solutionId: z.string().uuid().nullable() })) })
      .parse(await c.req.json());
    const access = await jiraAccess(config, ws);
    if (!access) throw new HTTPException(409, { message: "Connect Jira first." });
    const db = c.get("db");
    const keys = projects.map((p) => p.key);
    let removal = db.from("jira_projects").delete().eq("workspace_id", ws).eq("jira_site", access.siteUrl);
    if (keys.length) removal = removal.not("jira_project_key", "in", `(${keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",")})`);
    const { error: deleteError } = await removal;
    if (deleteError) throw new HTTPException(400, { message: deleteError.message });
    if (projects.length) {
      const rows = projects.map((p) => ({ workspace_id: ws, jira_site: access.siteUrl, jira_project_key: p.key, solution_id: p.solutionId }));
      const { error } = await db.from("jira_projects").upsert(rows, { onConflict: "workspace_id,jira_site,jira_project_key" });
      if (error) throw new HTTPException(400, { message: error.message });
    }
    return c.body(null, 204);
  });

  // The web app hands over the Microsoft token Supabase received at sign-in, so the worker can read Teams transcripts.
  app.post("/v1/integrations/microsoft", async (c) => {
    const config = need(c.get("member").role);
    const input = z
      .object({ accessToken: z.string().min(1), refreshToken: z.string().min(1).nullable(), expiresIn: z.number().int().positive().default(3600) })
      .parse(await c.req.json());
    const ws = c.get("member").workspaceId;
    const existing = await config.tokens.get(ws, "microsoft");
    await config.tokens.save({
      workspace_id: ws,
      provider: "microsoft",
      access_token: input.accessToken,
      refresh_token: input.refreshToken ?? existing?.refresh_token ?? null,
      expires_at: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
      meta: existing?.meta ?? {},
    });
    return c.body(null, 204);
  });

  app.delete("/v1/integrations/:provider", async (c) => {
    const config = need(c.get("member").role);
    const provider = z.enum(["jira", "microsoft"]).parse(c.req.param("provider"));
    await config.tokens.remove(c.get("member").workspaceId, provider);
    return c.body(null, 204);
  });
}
