/**
 * Turns a Teams WebVTT transcript into plain "Speaker: words" lines.
 * Teams writes the speaker as a voice tag: `<v Ana Silva>Let's ship it.</v>`.
 * Consecutive cues from the same speaker are merged to keep prompts short.
 */
export function vttToText(vtt: string): string {
  const lines: { speaker: string; text: string }[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const cue = block.split("\n").filter((l) => l && !l.includes("-->") && l !== "WEBVTT" && !/^\d+$/.test(l) && !/^[0-9a-f-]{8,}(\/\d+-\d+)?$/i.test(l));
    if (!cue.length) continue;
    const raw = cue.join(" ");
    const voice = raw.match(/<v\s+([^>]+)>([\s\S]*?)(<\/v>|$)/);
    const speaker = voice?.[1]?.trim() ?? "Unknown";
    const text = (voice?.[2] ?? raw).replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const last = lines.at(-1);
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else lines.push({ speaker, text });
  }
  return lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
}
