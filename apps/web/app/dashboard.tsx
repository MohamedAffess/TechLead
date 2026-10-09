"use client";
import type { Me } from "@techlead/api-client";
import { MICROSOFT_SCOPES, type Proposal, type Solution } from "@techlead/shared";
import { useEffect, useState } from "react";
import { api, configured, supabase } from "../lib/clients";
import { Integrations } from "./integrations";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "ready"; me: Me; solutions: Solution[]; proposals: Proposal[] }
  | { kind: "error"; message: string };

export function Dashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  async function load() {
    const session = (await supabase?.auth.getSession())?.data.session;
    if (!session) return setState({ kind: "signed-out" });
    try {
      const me = await api.me();
      const [solutions, proposals] = await Promise.all([api.solutions(), me.role === "owner" ? api.proposals() : Promise.resolve([])]);
      setState({ kind: "ready", me, solutions, proposals });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load your desk." });
    }
  }

  useEffect(() => {
    if (!configured) return setState({ kind: "error", message: "Supabase is not configured. Copy .env.example to .env and fill it in." });
    void load();
    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      // Microsoft's token is only on the session right after sign-in. Hand it to the
      // server so the worker can read Teams transcripts; non-owners are refused, which is fine.
      if (event === "SIGNED_IN" && session?.provider_token) {
        void api.saveMicrosoftToken({ accessToken: session.provider_token, refreshToken: session.provider_refresh_token ?? null }).catch(() => {});
      }
      void load();
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  if (state.kind === "loading") return <p className="muted">Opening your desk…</p>;
  if (state.kind === "error") return <p className="panel">{state.message}</p>;
  if (state.kind === "signed-out")
    return (
      <section className="panel">
        <h2>Sign in</h2>
        <p className="muted">Use your Microsoft work account.</p>
        <div className="row">
          <button className="primary" onClick={() => supabase?.auth.signInWithOAuth({ provider: "azure", options: { scopes: MICROSOFT_SCOPES.join(" ") } })}>
            Sign in with Microsoft
          </button>
        </div>
      </section>
    );

  return (
    <>
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Hello, {state.me.displayName}</h2>
          <span className="muted">({state.me.role})</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => supabase?.auth.signOut()}>Sign out</button>
        </div>
      </section>
      {state.me.role === "owner" && (
        <section className="panel">
          <h2 style={{ margin: 0 }}>Review inbox</h2>
          {state.proposals.length === 0 ? (
            <p className="muted">Nothing to review. New meeting transcripts and Jira changes land here as proposals.</p>
          ) : (
            state.proposals.map((p) => (
              <div key={p.id} className="row">
                <span>
                  <strong>{p.draft.kind.replace("_", " ")}</strong>: {"title" in p.draft ? p.draft.title : p.draft.personName}
                </span>
                <span className="muted">“{p.evidence}”</span>
                <span style={{ flex: 1 }} />
                <button className="primary" onClick={() => api.acceptProposal(p.id, "private").then(load)}>
                  Accept as private
                </button>
                <button onClick={() => api.acceptProposal(p.id, "team").then(load)}>Accept for team</button>
                <button onClick={() => api.rejectProposal(p.id).then(load)}>Reject</button>
              </div>
            ))
          )}
        </section>
      )}
      {state.me.role === "owner" && <Integrations solutions={state.solutions} />}
      <section className="panel">
        <h2 style={{ margin: 0 }}>Solutions</h2>
        {state.solutions.length === 0 ? (
          <p className="muted">No solutions yet.</p>
        ) : (
          <ul>
            {state.solutions.map((s) => (
              <li key={s.id}>
                {s.name} <span className="muted">· {s.phase} · {s.health}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
