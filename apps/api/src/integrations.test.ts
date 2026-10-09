import { describe, expect, it } from "vitest";
import { createApp, type Member } from "./app.js";
import { signState, verifyState, type IntegrationsConfig, type TokenRow } from "./integrations.js";

const owner: Member = { id: "m1", workspaceId: "w1", role: "owner", displayName: "Owner" };
const team: Member = { id: "m2", workspaceId: "w1", role: "team", displayName: "Team" };
const auth = { headers: { Authorization: "Bearer x" } };

function memoryTokens() {
  const rows = new Map<string, TokenRow>();
  return {
    rows,
    get: async (w: string, p: string) => rows.get(`${w}/${p}`) ?? null,
    save: async (r: TokenRow) => void rows.set(`${r.workspace_id}/${r.provider}`, r),
    remove: async (w: string, p: string) => void rows.delete(`${w}/${p}`),
  };
}

/** Answers the two Atlassian calls the callback makes. */
const atlassian: typeof fetch = async (input) => {
  const url = String(input);
  if (url === "https://auth.atlassian.com/oauth/token")
    return Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
  if (url === "https://api.atlassian.com/oauth/token/accessible-resources")
    return Response.json([{ id: "cloud-1", url: "https://infor.atlassian.net", name: "infor" }]);
  return new Response("unexpected", { status: 500 });
};

function setup(member: Member) {
  const tokens = memoryTokens();
  const integrations: IntegrationsConfig = {
    tokens,
    stateSecret: "test-secret",
    webUrl: "https://web.example",
    jira: { clientId: "cid", clientSecret: "secret", redirectUri: "https://api.example/integrations/jira/callback" },
    fetch: atlassian,
  };
  const app = createApp({ resolveMember: async () => ({ member, db: {} as never }), integrations });
  return { app, tokens };
}

describe("oauth state", () => {
  it("round-trips the workspace and rejects tampering or expiry", async () => {
    const state = await signState("s", "w1", 0);
    expect(await verifyState("s", state, 1000)).toBe("w1");
    expect(await verifyState("other", state, 1000)).toBeNull();
    expect(await verifyState("s", state, 11 * 60_000)).toBeNull();
    expect(await verifyState("s", `x${state}`, 1000)).toBeNull();
  });
});

describe("integrations", () => {
  it("are owner-only", async () => {
    const res = await setup(team).app.request("/v1/integrations", auth);
    expect(res.status).toBe(403);
  });

  it("say so when the server has no integration settings", async () => {
    const app = createApp({ resolveMember: async () => ({ member: owner, db: {} as never }) });
    const res = await app.request("/v1/integrations", auth);
    expect(res.status).toBe(503);
  });

  it("send the owner to Atlassian with read-only scopes", async () => {
    const res = await setup(owner).app.request("/v1/integrations/jira/connect", { method: "POST", ...auth });
    const { url } = (await res.json()) as { url: string };
    const params = new URL(url).searchParams;
    expect(params.get("scope")).toBe("read:jira-work read:jira-user offline_access");
    expect(await verifyState("test-secret", params.get("state")!)).toBe("w1");
  });

  it("store the Jira connection when Atlassian calls back", async () => {
    const { app, tokens } = setup(owner);
    const state = await signState("test-secret", "w1");
    const res = await app.request(`/integrations/jira/callback?code=abc&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://web.example/?jira=connected");
    expect(tokens.rows.get("w1/jira")).toMatchObject({ access_token: "at", refresh_token: "rt", meta: { cloudId: "cloud-1", siteName: "infor" } });

    const status = await (await app.request("/v1/integrations", auth)).json();
    expect(status).toMatchObject({ jira: { connected: true, site: "infor" }, microsoft: { connected: false } });
  });

  it("ignore a callback with a forged state", async () => {
    const { app, tokens } = setup(owner);
    const res = await app.request("/integrations/jira/callback?code=abc&state=forged.sig");
    expect(res.headers.get("Location")).toBe("https://web.example/?jira=denied");
    expect(tokens.rows.size).toBe(0);
  });

  it("keep the Microsoft refresh token when a later sign-in has none", async () => {
    const { app, tokens } = setup(owner);
    const post = (body: object) =>
      app.request("/v1/integrations/microsoft", { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ accessToken: "a1", refreshToken: "r1" })).status).toBe(204);
    await post({ accessToken: "a2", refreshToken: null });
    expect(tokens.rows.get("w1/microsoft")).toMatchObject({ access_token: "a2", refresh_token: "r1" });
  });
});
