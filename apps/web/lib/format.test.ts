import { it, expect } from "vitest";
import { formatPlanned, statusLabel } from "./format";
it("formats planned time in the brand timezone", () => {
  expect(formatPlanned("2026-10-19T08:00:00Z", "Europe/Brussels")).toBe("Mon 19 Oct, 10:00");
});
it("labels statuses for non-technical readers", () => {
  expect(statusLabel("pending_approval")).toBe("Needs your OK");
  expect(statusLabel("expired")).toBe("Didn't go out");
});
