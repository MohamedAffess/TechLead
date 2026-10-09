import { extractProposals, ExtractionRefused, type ExtractionContext } from "@techlead/ai";
import type { SupabaseClient } from "@techlead/db";
import { vttToText } from "@techlead/sync";

type SourceRow = {
  id: string;
  workspace_id: string;
  kind: "teams_transcript" | "jira_issue" | "note";
  title: string;
  body: string | null;
  storage_path: string | null;
  solution_id: string | null;
};

export function buildContext(
  workspace: { company_name: string; profile: string; focus: string },
  solutions: { id: string; name: string; summary: string }[],
  people: { display_name: string }[],
): ExtractionContext {
  return {
    companyName: workspace.company_name,
    companyProfile: workspace.profile,
    ownerFocus: workspace.focus,
    solutions,
    people: people.map((p) => p.display_name),
  };
}

async function sourceText(db: SupabaseClient, s: SourceRow): Promise<string> {
  if (s.kind === "teams_transcript" && s.storage_path) {
    const { data, error } = await db.storage.from("transcripts").download(s.storage_path);
    if (error) throw error;
    return vttToText(await data.text());
  }
  return s.body ?? "";
}

/** Sends every unprocessed source through Claude and files the results in the owner's inbox. */
export async function processSources(db: SupabaseClient, limit = 20): Promise<number> {
  const { data: sources, error } = await db.from("sources").select("*").is("processed_at", null).order("created_at").limit(limit);
  if (error) throw error;
  let done = 0;
  for (const s of (sources ?? []) as SourceRow[]) {
    const [{ data: ws }, { data: solutions }, { data: people }] = await Promise.all([
      db.from("workspaces").select("company_name, profile, focus").eq("id", s.workspace_id).single(),
      db.from("solutions").select("id, name, summary").eq("workspace_id", s.workspace_id),
      db.from("members").select("display_name").eq("workspace_id", s.workspace_id),
    ]);
    if (!ws) continue;
    try {
      const text = await sourceText(db, s);
      const result = await extractProposals({ kind: s.kind, title: s.title, text }, buildContext(ws, solutions ?? [], people ?? []));
      if (result.proposals.length) {
        const rows = result.proposals.map((p) => ({
          workspace_id: s.workspace_id,
          source_id: s.id,
          solution_id: p.solutionId ?? s.solution_id,
          draft: p.draft,
          evidence: p.evidence,
          confidence: p.confidence,
        }));
        const { error: insertError } = await db.from("proposals").insert(rows);
        if (insertError) throw insertError;
      }
      await db.from("sources").update({ processed_at: new Date().toISOString() }).eq("id", s.id);
      done++;
      console.log(`Processed "${s.title}": ${result.proposals.length} proposals`);
    } catch (err) {
      if (err instanceof ExtractionRefused) {
        // Mark it processed so it is not retried forever; the owner can still read the source.
        await db.from("sources").update({ processed_at: new Date().toISOString() }).eq("id", s.id);
        console.warn(`Skipped "${s.title}": ${err.message}`);
      } else {
        console.error(`Failed "${s.title}"; it will be retried next run`, err);
      }
    }
  }
  return done;
}
