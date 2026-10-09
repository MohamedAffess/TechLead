import { describe, expect, it } from "vitest";
import { vttToText } from "./vtt.js";

const SAMPLE = `WEBVTT

0f3a2b1c-1d2e-4f5a-8b9c-0d1e2f3a4b5c/12-0
00:00:01.000 --> 00:00:04.000
<v Ana Silva>We should move the vector store decision to Friday.</v>

0f3a2b1c-1d2e-4f5a-8b9c-0d1e2f3a4b5c/13-0
00:00:04.500 --> 00:00:06.000
<v Ana Silva>Ben, can you get the cost numbers?</v>

0f3a2b1c-1d2e-4f5a-8b9c-0d1e2f3a4b5c/14-0
00:00:06.500 --> 00:00:08.000
<v Ben Okafor>Yes, by Thursday.</v>
`;

describe("vttToText", () => {
  it("keeps speakers and merges their consecutive lines", () => {
    expect(vttToText(SAMPLE)).toBe(
      "Ana Silva: We should move the vector store decision to Friday. Ben, can you get the cost numbers?\nBen Okafor: Yes, by Thursday.",
    );
  });

  it("labels cues without a voice tag as Unknown", () => {
    expect(vttToText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello")).toBe("Unknown: Hello");
  });
});
