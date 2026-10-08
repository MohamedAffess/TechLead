/**
 * Read-only Microsoft Graph calls for Teams meeting transcripts.
 * The Entra ID app needs the delegated permission OnlineMeetingTranscript.Read.All
 * (or the application permission with an access policy). Nothing is ever written to Teams.
 */
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
