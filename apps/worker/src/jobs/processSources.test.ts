import { describe, expect, it } from "vitest";
import { buildContext } from "./processSources.js";

describe("buildContext", () => {
  it("passes the company, focus, solutions and people to the AI", () => {
    const ctx = buildContext(
      { company_name: "Infor", profile: "Industry cloud", focus: "SSO" },
      [{ id: "s1", name: "Payments", summary: "" }],
      [{ display_name: "Ana" }],
    );
    expect(ctx).toEqual({ companyName: "Infor", companyProfile: "Industry cloud", ownerFocus: "SSO", solutions: [{ id: "s1", name: "Payments", summary: "" }], people: ["Ana"] });
  });
});
