import type { Desk } from "../dashboard";
import { Empty, VisibilityTag } from "./shared";

const LABEL = { on_track: "on track", overloaded: "overloaded", blocked: "blocked", away: "away" } as const;

/** Each person's latest status, newest first, with their history folded underneath. */
export function TeamView({ desk }: { desk: Desk }) {
  const byPerson = new Map<string, Desk["team"]>();
  for (const s of desk.team) byPerson.set(s.personName, [...(byPerson.get(s.personName) ?? []), s]);
  return (
    <section className="panel">
      <h2>Team</h2>
      {byPerson.size === 0 ? (
        <Empty>No team updates yet. They come from stand-ups and 1:1s once Teams is connected.</Empty>
      ) : (
        <div className="people">
          {[...byPerson.entries()].map(([name, [latest, ...history]]) => (
            <article key={name} className="card">
              <div className="row">
                <strong>{name}</strong>
                <span className={`tag st-${latest!.status}`}>{LABEL[latest!.status]}</span>
                <VisibilityTag visibility={latest!.visibility} />
              </div>
              <p>{latest!.note || <span className="muted">No note.</span>}</p>
              <p className="muted small">as of {latest!.asOf}</p>
              {history.length > 0 && (
                <details>
                  <summary className="muted small">{history.length} earlier</summary>
                  <ul className="list small">
                    {history.map((h) => (
                      <li key={h.id}>
                        {h.asOf}: {LABEL[h.status]} {h.note && `· ${h.note}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
