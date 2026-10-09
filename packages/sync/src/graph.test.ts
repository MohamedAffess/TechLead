import { describe, expect, it } from "vitest";
import { meetingIdForJoinUrl, teamsMeetingsBetween } from "./graph.js";

describe("teamsMeetingsBetween", () => {
  it("keeps only Teams meetings that have a join link", async () => {
    let called = "";
    const fake: typeof fetch = async (input) => {
      called = String(input);
      return Response.json({
        value: [
          { subject: "Arch review", start: { dateTime: "2026-10-08T09:00:00" }, isOnlineMeeting: true, onlineMeeting: { joinUrl: "https://teams/1" } },
          { subject: "Lunch", start: { dateTime: "2026-10-08T12:00:00" }, isOnlineMeeting: false, onlineMeeting: null },
        ],
      });
    };
    const meetings = await teamsMeetingsBetween("t", new Date("2026-10-01T00:00:00Z"), new Date("2026-10-08T00:00:00Z"), fake);
    expect(meetings).toEqual([{ subject: "Arch review", start: "2026-10-08T09:00:00", joinUrl: "https://teams/1" }]);
    expect(called).toContain("/me/calendarView?startDateTime=2026-10-01T00%3A00%3A00.000Z");
  });
});

describe("meetingIdForJoinUrl", () => {
  it("escapes quotes in the filter and returns null when nothing matches", async () => {
    let called = "";
    const fake: typeof fetch = async (input) => {
      called = decodeURIComponent(String(input));
      return Response.json({ value: [] });
    };
    expect(await meetingIdForJoinUrl("t", "https://teams/it's", fake)).toBeNull();
    expect(called).toContain("JoinWebUrl eq 'https://teams/it''s'");
  });
});
