import { describe, expect, it } from "vitest";
import { contextBlock } from "./prompts.js";

describe("contextBlock", () => {
  it("includes the company, focus, solutions and people", () => {
    const text = contextBlock({
      companyName: "Infor",
      companyProfile: "Industry cloud software.",
      ownerFocus: "Payments SSO rollout",
      solutions: [{ id: "s1", name: "Payments", summary: "billing platform" }],
      people: ["Ana", "Ben"],
    });
    expect(text).toContain('<company name="Infor">');
    expect(text).toContain("Payments SSO rollout");
    expect(text).toContain("- s1: Payments, billing platform");
    expect(text).toContain("<people>Ana, Ben</people>");
  });

  it("says so when nothing is set yet", () => {
    const text = contextBlock({ companyName: "Infor", companyProfile: "", ownerFocus: "", solutions: [], people: [] });
    expect(text).toContain("No profile yet.");
    expect(text).toContain("- none yet");
  });
});
