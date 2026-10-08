/**
 * Read-only Jira Cloud client (OAuth 2.0, 3LO). It reads Jira data with GET
 * requests only (the one POST refreshes the sign-in token), and the OAuth app
 * should be granted read scopes only:
 * read:jira-work, read:jira-user, offline_access.
 */
export type JiraAuth = { accessToken: string; cloudId: string };

export type JiraProject = { id: string; key: string; name: string };

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  dueDate: string | null;
  updated: string;
  description: string;
};

const API = "https://api.atlassian.com/ex/jira";

async function get<T>(auth: JiraAuth, path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}/${auth.cloudId}/rest/api/3${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The projects the owner can pick from on the Jira settings screen. */
export async function listProjects(auth: JiraAuth, fetchImpl?: typeof fetch): Promise<JiraProject[]> {
  const page = await get<{ values: JiraProject[] }>(auth, "/project/search?maxResults=100&orderBy=name", fetchImpl);
  return page.values.map(({ id, key, name }) => ({ id, key, name }));
}

/** Issues in one selected project changed since the last sync. */
export async function issuesUpdatedSince(
  auth: JiraAuth,
  projectKey: string,
  since: Date | null,
  fetchImpl?: typeof fetch,
): Promise<JiraIssue[]> {
  const jql = `project = "${projectKey}"${since ? ` AND updated >= "${formatJqlDate(since)}"` : ""} ORDER BY updated DESC`;
  const fields = "summary,status,assignee,duedate,updated,description";
  const page = await get<{ issues: RawIssue[] }>(
    auth,
    `/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`,
    fetchImpl,
  );
  return page.issues.map(toIssue);
}

type RawIssue = {
  key: string;
  fields: {
    summary: string;
    status?: { name: string };
    assignee?: { displayName: string } | null;
    duedate?: string | null;
    updated: string;
    description?: unknown;
  };
};

function toIssue(raw: RawIssue): JiraIssue {
  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status?.name ?? "Unknown",
    assignee: raw.fields.assignee?.displayName ?? null,
    dueDate: raw.fields.duedate ?? null,
    updated: raw.fields.updated,
    description: adfToText(raw.fields.description),
  };
}

export function formatJqlDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Jira descriptions come as Atlassian Document Format; keep only the text. */
export function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(adfToText).join("");
  return n.type === "paragraph" || n.type === "heading" || n.type === "listItem" ? `${inner}\n` : inner;
}

/** The text the AI reads for one issue. */
export function issueToSourceText(issue: JiraIssue): string {
  return [
    `${issue.key}: ${issue.summary}`,
    `Status: ${issue.status}`,
    `Assignee: ${issue.assignee ?? "unassigned"}`,
    `Due: ${issue.dueDate ?? "none"}`,
    issue.description.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Exchanges a refresh token for a new access token (Atlassian rotates refresh tokens). */
export async function refreshJiraToken(
  input: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const res = await fetchImpl("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Jira token refresh failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}
