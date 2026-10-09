import type { Decision, Priority, Proposal, Risk, Role, Solution, Task, TaskStatus, TeamStatus, Visibility, Workspace } from "@techlead/shared";

export type Me = { id: string; workspaceId: string; role: Role; displayName: string };

export type ProfileDraft = { profile: string; focus: string; solutions: { name: string; summary: string }[] };

export type IntegrationStatus = {
  jira: { available: boolean; connected: boolean; site: string | null };
  microsoft: { connected: boolean; lastSyncedAt: string | null };
};

export type JiraProjectChoice = { key: string; name: string; selected: boolean; solutionId: string | null };

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Typed client shared by the web and iOS apps. `getToken` returns the
 * Supabase access token of the signed-in person.
 */
export function createApiClient(baseUrl: string, getToken: () => Promise<string | null>) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const q = (solutionId?: string) => (solutionId ? `?solutionId=${encodeURIComponent(solutionId)}` : "");

  return {
    me: () => call<Me>("/v1/me"),
    solutions: () => call<Solution[]>("/v1/solutions"),
    createSolution: (input: Omit<Solution, "id">) => call<Solution>("/v1/solutions", { method: "POST", body: JSON.stringify(input) }),
    tasks: (solutionId?: string) => call<Task[]>(`/v1/tasks${q(solutionId)}`),
    decisions: (solutionId?: string) => call<Decision[]>(`/v1/decisions${q(solutionId)}`),
    risks: (solutionId?: string) => call<Risk[]>(`/v1/risks${q(solutionId)}`),
    teamStatuses: (solutionId?: string) => call<TeamStatus[]>(`/v1/team-statuses${q(solutionId)}`),
    createTask: (input: { title: string; priority?: Priority; due?: string | null; solutionId?: string | null; visibility?: Visibility }) =>
      call<Task>("/v1/tasks", { method: "POST", body: JSON.stringify(input) }),
    setTaskStatus: (id: string, status: TaskStatus) => call<Task>(`/v1/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    workspace: () => call<Workspace>("/v1/workspace"),
    updateWorkspace: (input: Partial<Omit<Workspace, "id">>) => call<Workspace>("/v1/workspace", { method: "PATCH", body: JSON.stringify(input) }),
    draftProfile: (input: { companyName: string; aboutMe: string }) =>
      call<ProfileDraft>("/v1/workspace/draft", { method: "POST", body: JSON.stringify(input) }),
    addNote: (input: { title: string; text: string; solutionId: string | null }) =>
      call<{ id: string }>("/v1/sources/notes", { method: "POST", body: JSON.stringify(input) }),
    proposals: () => call<Proposal[]>("/v1/proposals"),
    acceptProposal: (id: string, visibility: Visibility) =>
      call<{ table: string }>(`/v1/proposals/${id}/accept`, { method: "POST", body: JSON.stringify({ visibility }) }),
    rejectProposal: (id: string) => call<void>(`/v1/proposals/${id}/reject`, { method: "POST" }),
    integrations: () => call<IntegrationStatus>("/v1/integrations"),
    jiraConnectUrl: () => call<{ url: string }>("/v1/integrations/jira/connect", { method: "POST" }),
    jiraProjects: () => call<JiraProjectChoice[]>("/v1/integrations/jira/projects"),
    saveJiraProjects: (projects: { key: string; solutionId: string | null }[]) =>
      call<void>("/v1/integrations/jira/projects", { method: "PUT", body: JSON.stringify({ projects }) }),
    saveMicrosoftToken: (input: { accessToken: string; refreshToken: string | null }) =>
      call<void>("/v1/integrations/microsoft", { method: "POST", body: JSON.stringify(input) }),
    disconnect: (provider: "jira" | "microsoft") => call<void>(`/v1/integrations/${provider}`, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
