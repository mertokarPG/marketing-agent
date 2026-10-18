import { describe, it, expect } from "vitest";
import { postingDaysText, approvalText, timezoneText } from "./brand-text";

describe("postingDaysText", () => {
  it("lists days in week order", () => { expect(postingDaysText({ coreDays: ["fri", "mon", "wed"] })).toBe("Monday, Wednesday, Friday"); });
  it("says every day", () => { expect(postingDaysText({ coreDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] })).toBe("Every day"); });
  it("copes with missing or odd data", () => { expect(postingDaysText(null)).toBe("Not set yet"); expect(postingDaysText({ coreDays: "mon" })).toBe("Not set yet"); });
});
describe("approvalText", () => {
  it("is plain words with no mode names", () => {
    expect(approvalText("review")).toBe("Nothing goes out until you say OK.");
    expect(approvalText("autopilot")).toBe("Posts go out on their own.");
    for (const m of ["review", "autopilot"]) expect(approvalText(m)).not.toMatch(/autopilot|review/i);
  });
});
describe("timezoneText", () => {
  it("names the city", () => { expect(timezoneText("Europe/Brussels")).toBe("Brussels time (Europe/Brussels)"); expect(timezoneText("America/New_York")).toBe("New York time (America/New_York)"); expect(timezoneText("UTC")).toBe("UTC"); });
});
