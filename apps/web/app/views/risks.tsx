import type { Level } from "@techlead/shared";
import type { Desk } from "../dashboard";
import { Empty, solutionName, VisibilityTag } from "./shared";

const LEVELS: Level[] = ["high", "medium", "low"];

/** Risks on an impact by likelihood grid, with the list underneath. */
export function RisksView({ desk }: { desk: Desk }) {
  if (desk.risks.length === 0)
    return (
      <section className="panel">
        <h2>Risks</h2>
        <Empty>No risks recorded.</Empty>
      </section>
    );
  const at = (impact: Level, likelihood: Level) => desk.risks.filter((r) => r.impact === impact && r.likelihood === likelihood);
  const severity = (i: Level, l: Level) => LEVELS.indexOf(i) + LEVELS.indexOf(l);
  return (
    <section className="panel">
      <h2>Risks</h2>
      <div className="scroll-x">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col">Impact ↓ / Likelihood →</th>
              {[...LEVELS].reverse().map((l) => (
                <th key={l} scope="col">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((i) => (
              <tr key={i}>
                <th scope="row">{i}</th>
                {[...LEVELS].reverse().map((l) => (
                  <td key={l} className={`sev-${severity(i, l)}`}>
                    {at(i, l).length || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list">
        {[...desk.risks]
          .sort((a, b) => severity(a.impact, a.likelihood) - severity(b.impact, b.likelihood))
          .map((r) => (
            <li key={r.id} className="item">
              <div className="row">
                <strong>{r.title}</strong>
                <span className="muted">
                  {r.impact} impact, {r.likelihood} likelihood
                </span>
                <VisibilityTag visibility={r.visibility} />
                <span className="muted">{solutionName(desk.solutions, r.solutionId) ?? ""}</span>
              </div>
              {r.mitigation && <p className="muted">Mitigation: {r.mitigation}</p>}
            </li>
          ))}
      </ul>
    </section>
  );
}
