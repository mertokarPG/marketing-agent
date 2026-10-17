import { describe, it, expect } from "vitest";
import { createTestDb } from "../src/testing.js";

describe("createTestDb", () => {
  it("runs parameterised queries", async () => {
    const { db } = await createTestDb({ migrations: false });
    const rows = await db.query<{ n: number; s: string }>("select $1::int as n, $2::text as s", [41, "x"]);
    expect(rows).toEqual([{ n: 41, s: "x" }]);
  });

  it("installs the Supabase-like shim", async () => {
    const { db } = await createTestDb({ migrations: false });
    const roles = await db.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1"
    );
    expect(roles.map((r) => r.rolname)).toEqual(["anon", "authenticated", "service_role"]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ["11111111-1111-1111-1111-111111111111"]);
    const [{ uid }] = await db.query<{ uid: string }>("select auth.uid() as uid");
    expect(uid).toBe("11111111-1111-1111-1111-111111111111");
  });
});
