import { it, expect, vi } from "vitest";
import { readWorkerEnv, withUserBrief } from "../../src/runtime/deps.js";

const base = { DATABASE_URL: "postgres://x", SUPABASE_URL: "https://s", SUPABASE_SERVICE_ROLE_KEY: "k", ANTHROPIC_API_KEY: "a" };

it("lists every missing required env var", () => {
  expect(() => readWorkerEnv({})).toThrow(/DATABASE_URL.*SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*ANTHROPIC_API_KEY/s);
});
it("applies defaults", () => {
  expect(readWorkerEnv(base)).toMatchObject({ WORKER_CONCURRENCY: 2, TMP_ROOT: "tmp/runs" });
});
it("accepts optional OWNER_EMAIL and POSTIZ_BRAND_ID", () => {
  expect(readWorkerEnv({ ...base, OWNER_EMAIL: "o@x.io", POSTIZ_BRAND_ID: "b1" })).toMatchObject({ OWNER_EMAIL: "o@x.io", POSTIZ_BRAND_ID: "b1" });
});
it("never echoes secret values in the error", () => {
  let msg = "";
  try { readWorkerEnv({ ...base, ANTHROPIC_API_KEY: "sk-secret-value", WORKER_CONCURRENCY: "99" }); } catch (e) { msg = (e as Error).message; }
  expect(msg).toMatch(/WORKER_CONCURRENCY/);
  expect(msg).not.toMatch(/sk-secret-value|postgres:\/\/x/);
});
it("withUserBrief passes the brief through to the agent options", async () => {
  const agent = vi.fn().mockResolvedValue({ summary: "s" });
  const wrapped = withUserBrief(agent as any, "make it about snow");
  const brand = { name: "b" } as any, db = {} as any;
  await wrapped(brand, db, { kind: "manual", periodKey: "p" } as any);
  expect(agent).toHaveBeenCalledWith(brand, db, { kind: "manual", periodKey: "p", userBrief: "make it about snow" });
});
it("withUserBrief is a no-op without a brief", () => {
  const agent = vi.fn();
  expect(withUserBrief(agent as any, undefined)).toBe(agent);
});
