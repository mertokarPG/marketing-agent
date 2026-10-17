import { describe, it, expect } from "vitest";
import { createTestDb } from "../src/testing.js";
import { serializeJsonParam } from "../src/db.js";

describe("serializeJsonParam", () => {
  it("passes pre-stringified JSON through instead of double-encoding it", () => {
    expect(serializeJsonParam('{"enabled":true}')).toBe('{"enabled":true}');
    expect(serializeJsonParam("null")).toBe("null");
  });

  it("stringifies non-string values", () => {
    expect(serializeJsonParam({ a: 1 })).toBe('{"a":1}');
    expect(serializeJsonParam([1, 2])).toBe("[1,2]");
    expect(serializeJsonParam(null)).toBe("null");
  });
});

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
