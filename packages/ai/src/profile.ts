import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DEFAULT_MODEL } from "./extract.js";

const ProfileDraft = z.object({
  /** What the company does, its products and vocabulary, as context for later extraction. */
  profile: z.string(),
  /** The owner's current focus, restated so the AI can rank what matters. */
  focus: z.string(),
  /** Solutions the owner mentioned, so they can be created in one click. */
  solutions: z.array(z.object({ name: z.string(), summary: z.string() })),
});
export type ProfileDraft = z.infer<typeof ProfileDraft>;

export const PROFILE_SYSTEM_PROMPT = `You help set up TechLead, a workspace for a technical lead who runs several solutions and acts as architect.
From the company name and the lead's own description of their work, write:
- profile: 120 to 200 words on what the company does, its main products and platforms, and the vocabulary that will show up in meetings and Jira (product names, acronyms). Use what you know about the company; say plainly when something is a guess, and never invent internal details.
- focus: two or three sentences restating the lead's current priorities in their own terms.
- solutions: each distinct solution, product area or initiative the lead says they own, with a one-sentence summary. Leave it empty if they name none.
The lead will edit all of this, so keep it plain and factual.`;

/** Drafts the company context that personalizes every later AI suggestion. */
export async function draftCompanyProfile(
  input: { companyName: string; aboutMe: string },
  client: Anthropic = new Anthropic(),
  model: string = DEFAULT_MODEL,
): Promise<ProfileDraft> {
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ProfileDraft) },
    system: PROFILE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `<company>${input.companyName}</company>\n<about_me>\n${input.aboutMe}\n</about_me>` }],
  });
  if (!response.parsed_output) throw new Error(`No profile draft (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
