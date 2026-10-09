import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ProposalDraft } from "@techlead/shared";
import { z } from "zod";
import { contextBlock, EXTRACTION_SYSTEM_PROMPT, type ExtractionContext } from "./prompts.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

const ExtractionResult = z.object({
  proposals: z.array(
    z.object({
      draft: ProposalDraft,
      solutionId: z.string().nullable(),
      evidence: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export type Source = { kind: "teams_transcript" | "jira_issue" | "note"; title: string; text: string };

export class ExtractionRefused extends Error {
  constructor(public readonly category: string | null) {
    super(`Claude declined to process this source${category ? ` (${category})` : ""}`);
  }
}

/**
 * Reads one source and returns proposals for the owner's review inbox.
 * Read-only: it never writes to Jira or Teams.
 */
export async function extractProposals(
  source: Source,
  ctx: ExtractionContext,
  client: Anthropic = new Anthropic(),
  model: string = DEFAULT_MODEL,
): Promise<ExtractionResult> {
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(ExtractionResult) },
    system: [
      // The instructions and the company context change rarely, so they are cached.
      { type: "text", text: EXTRACTION_SYSTEM_PROMPT },
      { type: "text", text: contextBlock(ctx), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `<source kind="${source.kind}" title="${source.title}">\n${source.text}\n</source>\n\nPropose items for review.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionRefused(response.stop_details?.category ?? null);
  }
  if (!response.parsed_output) {
    throw new Error(`Extraction returned no structured output (stop_reason: ${response.stop_reason})`);
  }
  // Drop solution ids the model made up; the reviewer can still assign one.
  const known = new Set(ctx.solutions.map((s) => s.id));
  return {
    proposals: response.parsed_output.proposals.map((p) => ({
      ...p,
      solutionId: p.solutionId && known.has(p.solutionId) ? p.solutionId : null,
    })),
  };
}
