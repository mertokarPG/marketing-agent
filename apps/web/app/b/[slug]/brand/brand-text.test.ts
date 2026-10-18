import { describe, it, expect } from "vitest";
import { postingDaysText, approvalText } from "./brand-text";

describe("postingDaysText", () => {
  it("lists days in week order", () => { expect(postingDaysText({ coreDays: ["fri", "mon", "wed"] })).toBe("Monday, Wednesday, Friday"); });
  it("says every day", () => { expect(postingDaysText({ coreDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] })).toBe("Every day"); });
  it("copes with missing or odd data", () => { expect(postingDaysText(null)).toBe("Not set yet"); expect(postingDaysText({ coreDays: "mon" })).toBe("Not set yet"); });
});
describe("approvalText", () => { it("is plain words", () => { expect(approvalText("review")).toMatch(/until you say OK/); expect(approvalText("autopilot")).toMatch(/on their own/); }); });
