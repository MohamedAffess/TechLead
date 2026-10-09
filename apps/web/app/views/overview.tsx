"use client";
import { useState } from "react";
import { api } from "../../lib/clients";
import type { Desk } from "../dashboard";
import { Empty, errorText, solutionName, today, VisibilityTag } from "./shared";

/** The landing view: what the AI found, and what needs the lead's attention now. */
export function OverviewView({ desk, reload }: { desk: Desk; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const owner = desk.me.role === "owner";
  const open = desk.tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due && t.due < today());
  const blocked = open.filter((t) => t.status === "blocked" && !overdue.includes(t));
  const urgent = open.filter((t) => t.priority === "P1" && t.status !== "blocked" && !(t.due && t.due < today()));
  const highRisks = desk.risks.filter((r) => r.impact === "high");
  const latest = new Map<string, Desk["team"][number]>();
  for (const s of desk.team) if (!latest.has(s.personName)) latest.set(s.personName, s);
  const strained = [...latest.values()].filter((s) => s.status === "blocked" || s.status === "overloaded");

  const act = (p: Promise<unknown>) =>
    p.then(reload).catch((err) => setError(errorText(err)));

  const attention = overdue.length + blocked.length + urgent.length + highRisks.length + strained.length;

  return (
    <>
      {owner && (
        <section className="panel">
          <h2>Review inbox</h2>
          <p className="muted">The AI read your meetings, notes and Jira and suggests these. Nothing is saved until you accept it.</p>
          {error && <p className="notice">{error}</p>}
          {desk.proposals.length === 0 ? (
            <Empty>Nothing to review. New meeting transcripts, notes and Jira changes land here.</Empty>
          ) : (
            <ul className="list">
              {desk.proposals.map((p) => (
                <li key={p.id} className="item">
                  <div className="row">
                    <span className="tag">{p.draft.kind.replace("_", " ")}</span>
                    <strong>{"title" in p.draft ? p.draft.title : `${p.draft.personName}: ${p.draft.status.replace("_", " ")}`}</strong>
                    <span className="muted">{p.confidence} confidence</span>
                  </div>
                  <blockquote>{p.evidence}</blockquote>
                  <div className="row">
                    <button className="primary" onClick={() => act(api.acceptProposal(p.id, "private"))}>
                      Accept as private
                    </button>
                    <button onClick={() => act(api.acceptProposal(p.id, "team"))}>Accept for team</button>
                    <button onClick={() => act(api.rejectProposal(p.id))}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Needs attention</h2>
        {attention === 0 ? (
          <Empty>Nothing overdue, blocked or high risk.</Empty>
        ) : (
          <ul className="list">
            {overdue.map((t) => (
              <li key={t.id} className="row">
                <span className="tag bad">overdue</span> {t.title} <span className="muted">due {t.due}</span>
                <Where desk={desk} id={t.solutionId} /> <VisibilityTag visibility={t.visibility} />
              </li>
            ))}
            {blocked.map((t) => (
              <li key={t.id} className="row">
                <span className="tag bad">blocked</span> {t.title} <Where desk={desk} id={t.solutionId} /> <VisibilityTag visibility={t.visibility} />
              </li>
            ))}
            {urgent.map((t) => (
              <li key={t.id} className="row">
                <span className="tag warn">P1</span> {t.title} {t.due && <span className="muted">due {t.due}</span>}
                <Where desk={desk} id={t.solutionId} /> <VisibilityTag visibility={t.visibility} />
              </li>
            ))}
            {highRisks.map((r) => (
              <li key={r.id} className="row">
                <span className="tag bad">high risk</span> {r.title} <span className="muted">{r.likelihood} likelihood</span> <Where desk={desk} id={r.solutionId} />
              </li>
            ))}
            {strained.map((s) => (
              <li key={s.id} className="row">
                <span className="tag warn">{s.status}</span> {s.personName} <span className="muted">{s.note}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Latest decisions</h2>
        {desk.decisions.length === 0 ? (
          <Empty>No decisions recorded yet.</Empty>
        ) : (
          <ul className="list">
            {desk.decisions.slice(0, 3).map((d) => (
              <li key={d.id} className="row">
                <span className="muted num">D-{d.number}</span> {d.title} <span className="tag">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Where({ desk, id }: { desk: Desk; id: string | null }) {
  const name = solutionName(desk.solutions, id);
  return name ? <span className="muted">· {name}</span> : null;
}
