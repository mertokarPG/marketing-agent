import { it, expect } from "vitest";
import { sandboxArgs } from "../../src/lib/browser.js";

it("adds no-sandbox flags only when PUPPETEER_NO_SANDBOX=1", () => {
  expect(sandboxArgs({})).toEqual([]);
  expect(sandboxArgs({ PUPPETEER_NO_SANDBOX: "1" })).toEqual(["--no-sandbox", "--disable-setuid-sandbox"]);
});
