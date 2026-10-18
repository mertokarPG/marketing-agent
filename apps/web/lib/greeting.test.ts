import { describe, it, expect } from "vitest";
import { greeting, firstName } from "./greeting";

const tz = "Europe/Brussels";
describe("greeting", () => {
  it("morning 05:00-11:59 Brussels", () => {
    expect(greeting(new Date("2026-10-19T03:00:00Z"), tz)).toBe("GOOD MORNING");
    expect(greeting(new Date("2026-10-19T09:59:00Z"), tz)).toBe("GOOD MORNING");
  });
  it("afternoon 12:00-17:59", () => {
    expect(greeting(new Date("2026-10-19T10:00:00Z"), tz)).toBe("GOOD AFTERNOON");
    expect(greeting(new Date("2026-10-19T15:59:00Z"), tz)).toBe("GOOD AFTERNOON");
  });
  it("evening otherwise", () => {
    expect(greeting(new Date("2026-10-19T16:00:00Z"), tz)).toBe("GOOD EVENING");
    expect(greeting(new Date("2026-10-19T02:59:00Z"), tz)).toBe("GOOD EVENING");
  });
});
describe("firstName", () => {
  it("uses user_metadata.first_name first", () => {
    expect(firstName({ email: "okar.mert@gmail.com", user_metadata: { first_name: " Mert ", full_name: "Someone Else" } })).toBe("Mert");
  });
  it("else the first word of full_name, then name", () => {
    expect(firstName({ user_metadata: { full_name: "Anna Maria Jones" } })).toBe("Anna");
    expect(firstName({ user_metadata: { name: "jo bloggs" } })).toBe("jo");
  });
  it("never derives a name from the email", () => {
    expect(firstName({ email: "okar.mert@gmail.com" })).toBeNull();
    expect(firstName({ email: "okar.mert@gmail.com", user_metadata: {} })).toBeNull();
    expect(firstName({ email: "a@b.com", user_metadata: { first_name: "  ", full_name: 42 } })).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
