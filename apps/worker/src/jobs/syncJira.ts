import type { SupabaseClient } from "@techlead/db";
import { issuesUpdatedSince, issueToSourceText, refreshJiraToken } from "@techlead/sync";

type TokenRow = { workspace_id: string; access_token: string; refresh_token: string | null; expires_at: string | null; meta: { cloudId?: string } };

/**
 * Pulls issues changed since the last run from each Jira project the owner
 * selected, and queues them as sources for the AI. Read-only towards Jira.
 */
export async function syncJira(db: SupabaseClient, env: { clientId?: string; clientSecret?: string }): Promise<number> {
  const { data: tokens, error } = await db.from("integration_tokens").select("*").eq("provider", "jira");
  if (error) throw error;
  let queued = 0;
  for (const t of (tokens ?? []) as TokenRow[]) {
    if (!t.meta.cloudId) continue;
    let accessToken = t.access_token;
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now() + 60_000 && t.refresh_token && env.clientId && env.clientSecret) {
      const fresh = await refreshJiraToken({ clientId: env.clientId, clientSecret: env.clientSecret, refreshToken: t.refresh_token });
      accessToken = fresh.accessToken;
      await db
        .from("integration_tokens")
        .update({ access_token: fresh.accessToken, refresh_token: fresh.refreshToken, expires_at: fresh.expiresAt })
        .eq("workspace_id", t.workspace_id)
        .eq("provider", "jira");
    }
    const auth = { accessToken, cloudId: t.meta.cloudId };
    const { data: projects } = await db.from("jira_projects").select("*").eq("workspace_id", t.workspace_id);
    for (const p of projects ?? []) {
      const startedAt = new Date();
      const issues = await issuesUpdatedSince(auth, p.jira_project_key, p.last_synced_at ? new Date(p.last_synced_at) : null);
      if (issues.length) {
        const rows = issues.map((i) => ({
          workspace_id: t.workspace_id,
          kind: "jira_issue",
          external_ref: i.key,
          title: `${i.key}: ${i.summary}`,
          body: issueToSourceText(i),
          solution_id: p.solution_id,
          processed_at: null,
        }));
        const { error: upsertError } = await db.from("sources").upsert(rows, { onConflict: "workspace_id,kind,external_ref" });
        if (upsertError) throw upsertError;
        queued += rows.length;
      }
      await db.from("jira_projects").update({ last_synced_at: startedAt.toISOString() }).eq("id", p.id);
    }
  }
  return queued;
}
