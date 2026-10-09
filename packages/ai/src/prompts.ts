/** What the AI knows about the owner's world before it reads anything. */
export type ExtractionContext = {
  companyName: string;
  companyProfile: string;
  ownerFocus: string;
  solutions: { id: string; name: string; summary: string }[];
  people: string[];
};

export const EXTRACTION_SYSTEM_PROMPT = `You help a technical lead and architect keep track of their work.
You read one source (a meeting transcript, a Jira issue, or a note) and propose items for their review:
tasks, architecture decisions, risks, and status updates about people.

Rules:
- Propose only what the source supports. Quote the supporting words in "evidence", verbatim and short.
- Prefer fewer, clearer items over many vague ones. Skip small talk and items already settled with no follow-up.
- A decision is "proposed" unless the source shows it was agreed.
- Use a solution id only when the source clearly concerns that solution; otherwise null.
- Use names exactly as they appear in the source or the people list. Never invent owners or dates.
- Set confidence to "low" when the owner, date or meaning is unclear, so the reviewer looks closer.`;

export function contextBlock(ctx: ExtractionContext): string {
  const solutions = ctx.solutions.length
    ? ctx.solutions.map((s) => `- ${s.id}: ${s.name}${s.summary ? `, ${s.summary}` : ""}`).join("\n")
    : "- none yet";
  const people = ctx.people.length ? ctx.people.join(", ") : "unknown";
  return [
    `<company name="${ctx.companyName}">\n${ctx.companyProfile || "No profile yet."}\n</company>`,
    `<owner_focus>\n${ctx.ownerFocus || "Not set."}\n</owner_focus>`,
    `<solutions>\n${solutions}\n</solutions>`,
    `<people>${people}</people>`,
  ].join("\n\n");
}
