import type { ProposalDraft, Visibility } from "@techlead/shared";

export type ProposalRow = {
  id: string;
  workspace_id: string;
  source_id: string;
  solution_id: string | null;
  draft: ProposalDraft;
};

export type RecordInsert =
  | { table: "tasks"; row: Record<string, unknown> }
  | { table: "decisions"; row: Record<string, unknown> }
  | { table: "risks"; row: Record<string, unknown> }
  | { table: "team_statuses"; row: Record<string, unknown> };

/**
 * Turns an accepted proposal into the row it becomes. The owner picks the
 * visibility at review time; the source link is kept so every record can
 * show where it came from.
 */
export function recordFromProposal(p: ProposalRow, visibility: Visibility, nextDecisionNumber: number): RecordInsert {
  const base = { workspace_id: p.workspace_id, solution_id: p.solution_id, source_id: p.source_id, visibility };
  const d = p.draft;
  switch (d.kind) {
    case "task":
      return { table: "tasks", row: { ...base, title: d.title, priority: d.priority, due: d.due, status: "todo" } };
    case "decision":
      return {
        table: "decisions",
        row: { ...base, number: nextDecisionNumber, title: d.title, status: d.status, context: d.context, decision: d.decision, consequences: d.consequences },
      };
    case "risk":
      return { table: "risks", row: { ...base, title: d.title, impact: d.impact, likelihood: d.likelihood, mitigation: d.mitigation } };
    case "team_status":
      return { table: "team_statuses", row: { ...base, person_name: d.personName, status: d.status, note: d.note } };
  }
}
