/**
 * Read-only Microsoft Graph calls for Teams meeting transcripts.
 * The Entra ID app needs the delegated permission OnlineMeetingTranscript.Read.All
 * (or the application permission with an access policy). Nothing is ever written to Teams.
 */
import { MICROSOFT_SCOPES } from "@techlead/shared";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type TranscriptRef = { meetingId: string; transcriptId: string; createdDateTime: string };

async function graphGet(accessToken: string, path: string, accept: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const res = await fetchImpl(`${GRAPH}${path}`, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: accept } });
  if (!res.ok) throw new Error(`Graph GET ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

/** Transcripts available for one of the signed-in user's online meetings. */
export async function listTranscripts(accessToken: string, meetingId: string, fetchImpl?: typeof fetch): Promise<TranscriptRef[]> {
  const res = await graphGet(accessToken, `/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`, "application/json", fetchImpl);
  const body = (await res.json()) as { value: { id: string; createdDateTime: string }[] };
  return body.value.map((t) => ({ meetingId, transcriptId: t.id, createdDateTime: t.createdDateTime }));
}

/** The transcript as WebVTT text; pass it through vttToText before sending it to the AI. */
export async function fetchTranscriptVtt(accessToken: string, ref: TranscriptRef, fetchImpl?: typeof fetch): Promise<string> {
  const path = `/me/onlineMeetings/${encodeURIComponent(ref.meetingId)}/transcripts/${encodeURIComponent(ref.transcriptId)}/content?$format=text/vtt`;
  const res = await graphGet(accessToken, path, "text/vtt", fetchImpl);
  return res.text();
}


/** Exchanges a Microsoft refresh token for a new Graph access token. */
export async function refreshMicrosoftToken(
  input: { tenantId: string; clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(input.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? input.refreshToken,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

export type CalendarMeeting = { subject: string; start: string; joinUrl: string };

/** Teams meetings on the signed-in user's calendar between two times. */
export async function teamsMeetingsBetween(accessToken: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<CalendarMeeting[]> {
  const params = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: "subject,start,isOnlineMeeting,onlineMeeting",
    $top: "100",
  });
  const res = await graphGet(accessToken, `/me/calendarView?${params}`, "application/json", fetchImpl);
  const body = (await res.json()) as {
    value: { subject: string | null; start: { dateTime: string }; isOnlineMeeting: boolean; onlineMeeting: { joinUrl?: string } | null }[];
  };
  return body.value
    .filter((e) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl)
    .map((e) => ({ subject: e.subject || "Teams meeting", start: e.start.dateTime, joinUrl: e.onlineMeeting!.joinUrl! }));
}

/** The online meeting id behind a join link, or null when Graph does not return it (for example, someone else organized it). */
export async function meetingIdForJoinUrl(accessToken: string, joinUrl: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const res = await graphGet(accessToken, `/me/onlineMeetings?$filter=${encodeURIComponent(filter)}`, "application/json", fetchImpl);
  const body = (await res.json()) as { value: { id: string }[] };
  return body.value[0]?.id ?? null;
}
