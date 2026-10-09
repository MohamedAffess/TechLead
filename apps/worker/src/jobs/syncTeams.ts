import type { SupabaseClient } from "@techlead/db";
import { fetchTranscriptVtt, listTranscripts, meetingIdForJoinUrl, refreshMicrosoftToken, teamsMeetingsBetween } from "@techlead/sync";

type TokenRow = {
  workspace_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  meta: { lastSyncedAt?: string };
};

export type MicrosoftEnv = { tenantId?: string; clientId?: string; clientSecret?: string };

/** How far back the first run looks for meetings. */
const FIRST_RUN_DAYS = 7;

/**
 * Finds Teams meetings on the owner's calendar since the last run, saves any
 * new transcripts to storage and queues them for the AI. Read-only towards Teams.
 */
export async function syncTeams(db: SupabaseClient, env: MicrosoftEnv, fetchImpl?: typeof fetch): Promise<number> {
  const { data: tokens, error } = await db.from("integration_tokens").select("*").eq("provider", "microsoft");
  if (error) throw error;
  let queued = 0;
  for (const t of (tokens ?? []) as TokenRow[]) {
    let accessToken = t.access_token;
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now() + 60_000) {
      if (!t.refresh_token || !env.tenantId || !env.clientId || !env.clientSecret) {
        console.warn("Teams: sign-in expired and cannot be refreshed; sign in again on the web app");
        continue;
      }
      const fresh = await refreshMicrosoftToken(
        { tenantId: env.tenantId, clientId: env.clientId, clientSecret: env.clientSecret, refreshToken: t.refresh_token },
        fetchImpl,
      );
      accessToken = fresh.accessToken;
      await db
        .from("integration_tokens")
        .update({ access_token: fresh.accessToken, refresh_token: fresh.refreshToken, expires_at: fresh.expiresAt })
        .eq("workspace_id", t.workspace_id)
        .eq("provider", "microsoft");
    }

    const until = new Date();
    const from = t.meta.lastSyncedAt ? new Date(t.meta.lastSyncedAt) : new Date(until.getTime() - FIRST_RUN_DAYS * 86_400_000);
    // Transcripts appear a few minutes after a meeting ends, so look back an extra day each run;
    // transcripts already saved are skipped below.
    from.setTime(from.getTime() - 86_400_000);

    const meetings = await teamsMeetingsBetween(accessToken, from, until, fetchImpl);
    for (const m of meetings) {
      try {
        const meetingId = await meetingIdForJoinUrl(accessToken, m.joinUrl, fetchImpl);
        if (!meetingId) continue;
        for (const ref of await listTranscripts(accessToken, meetingId, fetchImpl)) {
          const { data: existing } = await db
            .from("sources")
            .select("id")
            .eq("workspace_id", t.workspace_id)
            .eq("kind", "teams_transcript")
            .eq("external_ref", ref.transcriptId)
            .maybeSingle();
          if (existing) continue;
          const vtt = await fetchTranscriptVtt(accessToken, ref, fetchImpl);
          const path = `${t.workspace_id}/${ref.transcriptId}.vtt`;
          const { error: uploadError } = await db.storage.from("transcripts").upload(path, vtt, { contentType: "text/vtt", upsert: true });
          if (uploadError) throw uploadError;
          const { error: insertError } = await db.from("sources").insert({
            workspace_id: t.workspace_id,
            kind: "teams_transcript",
            external_ref: ref.transcriptId,
            title: `${m.subject} (${m.start.slice(0, 10)})`,
            storage_path: path,
          });
          if (insertError) throw insertError;
          queued++;
        }
      } catch (err) {
        // One meeting failing (often: organized by someone else) must not stop the rest.
        console.warn(`Teams: skipped "${m.subject}"`, err instanceof Error ? err.message : err);
      }
    }
    await db
      .from("integration_tokens")
      .update({ meta: { ...t.meta, lastSyncedAt: until.toISOString() } })
      .eq("workspace_id", t.workspace_id)
      .eq("provider", "microsoft");
  }
  return queued;
}
