import { userClient, type DbConfig } from "@techlead/db";
import type { Deps, Member } from "./app.js";

type MemberRow = { id: string | null; workspace_id: string; role: Member["role"]; display_name: string };

/** Production membership lookup: Supabase verifies the token, row-level security does the rest. */
export function supabaseMembers(config: DbConfig): Deps["resolveMember"] {
  return async (accessToken) => {
    const db = userClient(config, accessToken);
    const { data: auth, error } = await db.auth.getUser(accessToken);
    if (error || !auth.user) return null;
    let { data } = await db
      .from("members")
      .select("id, workspace_id, role, display_name")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle<MemberRow>();
    if (!data) {
      // First sign-in of the configured owner sets up the workspace (see the claim_owner migration).
      const meta = auth.user.user_metadata as { full_name?: string; name?: string };
      const claimed = await db.rpc("claim_workspace", { display_name: meta.full_name ?? meta.name ?? "" }).maybeSingle<MemberRow>();
      data = claimed.data?.id ? claimed.data : null;
    }
    if (!data?.id) return null;
    const member: Member = { id: data.id, workspaceId: data.workspace_id, role: data.role, displayName: data.display_name };
    return { member, db };
  };
}
