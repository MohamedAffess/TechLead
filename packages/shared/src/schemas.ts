import { z } from "zod";
import { VISIBILITIES } from "./access.js";

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const visibility = z.enum(VISIBILITIES);

export const Health = z.enum(["green", "amber", "red"]);
export const Phase = z.enum(["discovery", "design", "build", "run", "sunset"]);
export const TaskStatus = z.enum(["todo", "doing", "blocked", "done"]);
export const Priority = z.enum(["P1", "P2", "P3"]);
export const DecisionStatus = z.enum(["proposed", "accepted", "superseded", "rejected"]);
export const PersonStatus = z.enum(["on_track", "overloaded", "blocked", "away"]);
export const Level = z.enum(["low", "medium", "high"]);
export const SourceKind = z.enum(["teams_transcript", "jira_issue", "note"]);

/** Fields every record carries: where it belongs, where it came from, and who may see it. */
const recordBase = {
  id,
  solutionId: id.nullable(),
  sourceId: id.nullable(),
  visibility,
  createdAt: z.string().datetime(),
};

export const Workspace = z.object({
  id,
  companyName: z.string().min(1),
  profile: z.string().default(""),
  focus: z.string().default(""),
});

export const Solution = z.object({
  id,
  name: z.string().min(1),
  summary: z.string().default(""),
  health: Health,
  phase: Phase,
  visibility,
});

export const Task = z.object({
  ...recordBase,
  title: z.string().min(1),
  status: TaskStatus,
  priority: Priority,
  ownerMemberId: id.nullable(),
  due: isoDate.nullable(),
  jiraKey: z.string().nullable(),
});

export const Decision = z.object({
  ...recordBase,
  number: z.number().int().positive(),
  title: z.string().min(1),
  status: DecisionStatus,
  context: z.string().default(""),
  decision: z.string().default(""),
  consequences: z.string().default(""),
});

export const Risk = z.object({
  ...recordBase,
  title: z.string().min(1),
  impact: Level,
  likelihood: Level,
  mitigation: z.string().default(""),
});

export const TeamStatus = z.object({
  ...recordBase,
  personName: z.string().min(1),
  status: PersonStatus,
  note: z.string().default(""),
  asOf: isoDate,
});

/** What the AI suggests. Nothing becomes a record until the owner accepts it. */
export const ProposalDraft = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), title: z.string(), ownerName: z.string().nullable(), due: isoDate.nullable(), priority: Priority }),
  z.object({ kind: z.literal("decision"), title: z.string(), status: DecisionStatus, context: z.string(), decision: z.string(), consequences: z.string() }),
  z.object({ kind: z.literal("risk"), title: z.string(), impact: Level, likelihood: Level, mitigation: z.string() }),
  z.object({ kind: z.literal("team_status"), personName: z.string(), status: PersonStatus, note: z.string() }),
]);

export const Proposal = z.object({
  id,
  sourceId: id,
  solutionId: id.nullable(),
  draft: ProposalDraft,
  /** The words in the source that support this proposal, shown next to it in the inbox. */
  evidence: z.string(),
  confidence: Level,
  state: z.enum(["pending", "accepted", "rejected"]),
  createdAt: z.string().datetime(),
});

export type Workspace = z.infer<typeof Workspace>;
export type Solution = z.infer<typeof Solution>;
export type Task = z.infer<typeof Task>;
export type Decision = z.infer<typeof Decision>;
export type Risk = z.infer<typeof Risk>;
export type TeamStatus = z.infer<typeof TeamStatus>;
export type ProposalDraft = z.infer<typeof ProposalDraft>;
export type Proposal = z.infer<typeof Proposal>;
