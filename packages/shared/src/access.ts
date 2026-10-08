/**
 * Who sees what. This mirrors the row-level security policies in
 * packages/db/supabase/migrations, so the UI can hide what the database
 * would refuse anyway.
 */
export const ROLES = ["owner", "team", "guest"] as const;
export type Role = (typeof ROLES)[number];

export const VISIBILITIES = ["private", "team", "guest"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const VISIBLE_TO: Record<Role, readonly Visibility[]> = {
  owner: ["private", "team", "guest"],
  team: ["team", "guest"],
  guest: ["guest"],
};

export function canView(role: Role, visibility: Visibility): boolean {
  return VISIBLE_TO[role].includes(visibility);
}

export type EditTarget = {
  kind: "task" | "team_status" | "decision" | "risk" | "solution";
  visibility: Visibility;
  ownerMemberId?: string | null;
};

/** Owners edit everything; team members edit their own tasks and status on team items; guests never edit. */
export function canEdit(role: Role, memberId: string, target: EditTarget): boolean {
  if (role === "owner") return true;
  if (role === "guest") return false;
  if (!canView(role, target.visibility)) return false;
  return (target.kind === "task" || target.kind === "team_status") && target.ownerMemberId === memberId;
}

/** Only the owner reviews AI proposals and manages Jira, Teams and settings. */
export function canReviewProposals(role: Role): boolean {
  return role === "owner";
}

export function canManageIntegrations(role: Role): boolean {
  return role === "owner";
}
