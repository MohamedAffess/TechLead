import type { Desk } from "../dashboard";
import { Empty, solutionName, VisibilityTag } from "./shared";

/** The decision log, numbered like ADRs. */
export function DecisionsView({ desk }: { desk: Desk }) {
  return (
    <section className="panel">
      <h2>Decisions</h2>
      {desk.decisions.length === 0 ? (
        <Empty>No decisions yet. When a meeting settles something, the AI proposes it here for you to accept.</Empty>
      ) : (
        <ul className="list">
          {desk.decisions.map((d) => (
            <li key={d.id} className="item">
              <details>
                <summary className="row">
                  <span className="muted num">D-{d.number}</span>
                  <strong>{d.title}</strong>
                  <span className="tag">{d.status}</span>
                  <VisibilityTag visibility={d.visibility} />
                  <span className="muted">{solutionName(desk.solutions, d.solutionId) ?? ""}</span>
                </summary>
                <dl className="adr">
                  <dt>Context</dt>
                  <dd>{d.context || "Not recorded."}</dd>
                  <dt>Decision</dt>
                  <dd>{d.decision || "Not recorded."}</dd>
                  <dt>Consequences</dt>
                  <dd>{d.consequences || "Not recorded."}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
