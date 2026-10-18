import { describe, it, expect } from "vitest";
import { greeting, firstNameFromEmail } from "./greeting";

const tz = "Europe/Brussels";
describe("greeting", () => {
  it("morning 05:00-11:59 Brussels", () => {
    expect(greeting(new Date("2026-10-19T03:00:00Z"), tz, "Mert")).toBe("GOOD MORNING");
    expect(greeting(new Date("2026-10-19T09:59:00Z"), tz, "Mert")).toBe("GOOD MORNING");
  });
  it("afternoon 12:00-17:59", () => {
    expect(greeting(new Date("2026-10-19T10:00:00Z"), tz, null)).toBe("GOOD AFTERNOON");
    expect(greeting(new Date("2026-10-19T15:59:00Z"), tz, null)).toBe("GOOD AFTERNOON");
  });
  it("evening otherwise", () => {
    expect(greeting(new Date("2026-10-19T16:00:00Z"), tz, null)).toBe("GOOD EVENING");
    expect(greeting(new Date("2026-10-19T02:59:00Z"), tz, null)).toBe("GOOD EVENING");
  });
});
describe("firstNameFromEmail", () => {
  it("takes local part before . + or digits, capitalised", () => {
    expect(firstNameFromEmail("mert.okar@gmail.com")).toBe("Mert");
    expect(firstNameFromEmail("anna+x@y.com")).toBe("Anna");
    expect(firstNameFromEmail("jo99@y.com")).toBe("Jo");
  });
  it("falls back to there", () => {
    expect(firstNameFromEmail(null)).toBe("there");
    expect(firstNameFromEmail("123@y.com")).toBe("there");
  });
});
