import { serviceClient, type DbConfig } from "@techlead/db";
import type { IntegrationsConfig, TokenStore } from "./integrations.js";

/** Keeps integration tokens in Supabase, through the service role (the table has no user policies). */
export function supabaseTokens(config: DbConfig): TokenStore {
  const db = serviceClient(config);
  return {
    async get(workspaceId, provider) {
      const { data, error } = await db.from("integration_tokens").select("*").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
      if (error) throw error;
      return data;
    },
    async save(row) {
      const { error } = await db.from("integration_tokens").upsert(row, { onConflict: "workspace_id,provider" });
      if (error) throw error;
    },
    async remove(workspaceId, provider) {
      const { error } = await db.from("integration_tokens").delete().eq("workspace_id", workspaceId).eq("provider", provider);
      if (error) throw error;
    },
  };
}

/** Integrations turn on once the service key, a state secret and the public URLs are set. */
export function integrationsFromEnv(config: DbConfig, env: Record<string, string | undefined> = process.env): IntegrationsConfig | undefined {
  const { OAUTH_STATE_SECRET: stateSecret, WEB_URL: webUrl, API_URL: apiUrl } = env;
  if (!config.serviceRoleKey || !stateSecret || !webUrl || !apiUrl) return undefined;
  const jira =
    env.JIRA_CLIENT_ID && env.JIRA_CLIENT_SECRET
      ? { clientId: env.JIRA_CLIENT_ID, clientSecret: env.JIRA_CLIENT_SECRET, redirectUri: `${apiUrl.replace(/\/$/, "")}/integrations/jira/callback` }
      : undefined;
  return { tokens: supabaseTokens(config), stateSecret, webUrl: webUrl.replace(/\/$/, ""), jira };
}
