import { userClient, type DbConfig } from "@techlead/db";
import type { Deps, Member } from "./app.js";

/** Production membership lookup: Supabase verifies the token, row-level security does the rest. */
export function supabaseMembers(config: DbConfig): Deps["resolveMember"] {
  return async (accessToken) => {
    const db = userClient(config, accessToken);
    const { data: auth, error } = await db.auth.getUser(accessToken);
    if (error || !auth.user) return null;
    const { data } = await db
      .from("members")
      .select("id, workspace_id, role, display_name")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const member: Member = { id: data.id, workspaceId: data.workspace_id, role: data.role, displayName: data.display_name };
    return { member, db };
  };
}
