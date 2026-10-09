import { describe, expect, it, vi } from "vitest";
import { adfToText, issuesUpdatedSince, issueToSourceText, listProjects } from "./jira.js";

const auth = { accessToken: "t", cloudId: "c1" };

function fakeFetch(body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
}

describe("jira client", () => {
  it("lists projects with GET only", async () => {
    const f = fakeFetch({ values: [{ id: "1", key: "PAY", name: "Payments", extra: true }] });
    expect(await listProjects(auth, f)).toEqual([{ id: "1", key: "PAY", name: "Payments" }]);
    expect(f.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("queries one project since the last sync", async () => {
    const f = fakeFetch({
      issues: [{ key: "PAY-1", fields: { summary: "SSO", status: { name: "Blocked" }, assignee: null, duedate: "2026-10-20", updated: "2026-10-08T10:00:00.000+0000" } }],
    });
    const issues = await issuesUpdatedSince(auth, "PAY", new Date("2026-10-01T08:30:00Z"), f);
    expect(issues[0]).toMatchObject({ key: "PAY-1", status: "Blocked", assignee: null });
    const url = decodeURIComponent(String(f.mock.calls[0]?.[0]));
    expect(url).toContain('project = "PAY" AND updated >= "2026-10-01 08:30"');
  });

  it("flattens Atlassian Document Format", () => {
    const adf = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Waiting on " }, { type: "text", text: "legal" }] }] };
    expect(adfToText(adf)).toBe("Waiting on legal\n");
  });

  it("builds the text the AI reads", () => {
    const text = issueToSourceText({ key: "PAY-1", summary: "SSO", status: "Blocked", assignee: null, dueDate: null, updated: "", description: "" });
    expect(text).toBe("PAY-1: SSO\nStatus: Blocked\nAssignee: unassigned\nDue: none");
  });
});

describe("jiraAuthorizeUrl", () => {
  it("asks Atlassian for read-only access", async () => {
    const { jiraAuthorizeUrl } = await import("./jira.js");
    const url = new URL(jiraAuthorizeUrl({ clientId: "c", redirectUri: "https://api/cb", state: "s" }));
    expect(url.origin).toBe("https://auth.atlassian.com");
    expect(url.searchParams.get("scope")).toBe("read:jira-work read:jira-user offline_access");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api/cb");
  });
});
