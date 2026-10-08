import type { Proposal, Role, Solution, Task, Visibility } from "@techlead/shared";

export type Me = { id: string; workspaceId: string; role: Role; displayName: string };

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

  return {
    me: () => call<Me>("/v1/me"),
    solutions: () => call<Solution[]>("/v1/solutions"),
    createSolution: (input: Omit<Solution, "id">) => call<Solution>("/v1/solutions", { method: "POST", body: JSON.stringify(input) }),
    tasks: (solutionId?: string) => call<Task[]>(`/v1/tasks${solutionId ? `?solutionId=${encodeURIComponent(solutionId)}` : ""}`),
    addNote: (input: { title: string; text: string; solutionId: string | null }) =>
      call<{ id: string }>("/v1/sources/notes", { method: "POST", body: JSON.stringify(input) }),
    proposals: () => call<Proposal[]>("/v1/proposals"),
    acceptProposal: (id: string, visibility: Visibility) =>
      call<{ table: string }>(`/v1/proposals/${id}/accept`, { method: "POST", body: JSON.stringify({ visibility }) }),
    rejectProposal: (id: string) => call<void>(`/v1/proposals/${id}/reject`, { method: "POST" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
