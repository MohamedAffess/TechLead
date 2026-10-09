"use client";
import type { Me } from "@techlead/api-client";
import { MICROSOFT_SCOPES, type Decision, type Proposal, type Risk, type Solution, type Task, type TeamStatus, type Workspace } from "@techlead/shared";
import { useEffect, useState } from "react";
import { api, configured, supabase } from "../lib/clients";
import { DecisionsView } from "./views/decisions";
import { OverviewView } from "./views/overview";
import { RisksView } from "./views/risks";
import { SetupView } from "./views/setup";
import { TasksView } from "./views/tasks";
import { TeamView } from "./views/team";

export type Desk = {
  me: Me;
  workspace: Workspace;
  solutions: Solution[];
  tasks: Task[];
  decisions: Decision[];
  risks: Risk[];
  team: TeamStatus[];
  proposals: Proposal[];
};

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "ready"; desk: Desk } | { kind: "error"; message: string };

const TABS = [
  { id: "today", label: "Today" },
  { id: "tasks", label: "Tasks" },
  { id: "decisions", label: "Decisions" },
  { id: "risks", label: "Risks" },
  { id: "team", label: "Team" },
  { id: "setup", label: "Setup", ownerOnly: true },
] as const;
type Tab = (typeof TABS)[number]["id"];

async function loadDesk(): Promise<Desk> {
  const me = await api.me();
  const owner = me.role === "owner";
  const [workspace, solutions, tasks, decisions, risks, team, proposals] = await Promise.all([
    api.workspace(),
    api.solutions(),
    api.tasks(),
    api.decisions(),
    api.risks(),
    api.teamStatuses(),
    owner ? api.proposals() : Promise.resolve([]),
  ]);
  return { me, workspace, solutions, tasks, decisions, risks, team, proposals };
}

export function Dashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("today");
  const [solutionId, setSolutionId] = useState<string>("");

  async function load() {
    const session = (await supabase?.auth.getSession())?.data.session;
    if (!session) return setState({ kind: "signed-out" });
    try {
      const desk = await loadDesk();
      setState({ kind: "ready", desk });
      // First visit: the owner describes the company before anything else.
      if (desk.me.role === "owner" && !desk.workspace.profile.trim()) setTab((t) => (t === "today" ? "setup" : t));
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load your desk." });
    }
  }

  useEffect(() => {
    if (!configured) return setState({ kind: "error", message: "Supabase is not configured. Copy .env.example to .env and fill it in." });
    if (new URLSearchParams(window.location.search).has("jira")) setTab("setup");
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

  const { desk } = state;
  const owner = desk.me.role === "owner";
  const inSolution = <T extends { solutionId: string | null }>(items: T[]) => (solutionId ? items.filter((i) => i.solutionId === solutionId) : items);
  const filtered: Desk = {
    ...desk,
    tasks: inSolution(desk.tasks),
    decisions: inSolution(desk.decisions),
    risks: inSolution(desk.risks),
    team: inSolution(desk.team),
    proposals: inSolution(desk.proposals),
  };
  const counts: Partial<Record<Tab, number>> = { today: filtered.proposals.length };

  return (
    <>
      <div className="row bar">
        <span>
          {desk.workspace.companyName} · <strong>{desk.me.displayName}</strong> <span className="muted">({desk.me.role})</span>
        </span>
        <span className="grow" />
        <label className="row">
          <span className="muted">Solution</span>
          <select value={solutionId} onChange={(e) => setSolutionId(e.target.value)}>
            <option value="">All solutions</option>
            {desk.solutions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => supabase?.auth.signOut()}>Sign out</button>
      </div>

      <nav className="tabs" aria-label="Sections">
        {TABS.filter((t) => owner || !("ownerOnly" in t)).map((t) => (
          <button key={t.id} className={tab === t.id ? "tab on" : "tab"} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
            {counts[t.id] ? <span className="count">{counts[t.id]}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "today" && <OverviewView desk={filtered} reload={load} />}
      {tab === "tasks" && <TasksView desk={filtered} reload={load} defaultSolutionId={solutionId || null} />}
      {tab === "decisions" && <DecisionsView desk={filtered} />}
      {tab === "risks" && <RisksView desk={filtered} />}
      {tab === "team" && <TeamView desk={filtered} />}
      {tab === "setup" && owner && <SetupView desk={desk} reload={load} />}
    </>
  );
}
