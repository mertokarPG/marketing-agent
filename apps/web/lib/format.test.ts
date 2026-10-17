import { it, expect } from "vitest";
import { formatPlanned, statusLabel } from "./format";
import { safeNextPath } from "./safe-redirect";
it("formats planned time in the brand timezone", () => {
  expect(formatPlanned("2026-10-19T08:00:00Z", "Europe/Brussels")).toBe("Mon 19 Oct, 10:00");
});
it("labels statuses for non-technical readers", () => {
  expect(statusLabel("pending_approval")).toBe("Needs your OK");
  expect(statusLabel("expired")).toBe("Expired (not approved in time)");
});
it("only allows same-origin relative redirect paths", () => {
  expect(safeNextPath("/brands/x")).toBe("/brands/x");
  expect(safeNextPath("//evil.com")).toBe("/");
  expect(safeNextPath("/\\evil.com")).toBe("/");
  expect(safeNextPath("https://evil.com")).toBe("/");
  expect(safeNextPath(null)).toBe("/");
});
