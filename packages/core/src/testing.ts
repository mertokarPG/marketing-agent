import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.js";

const SHIM = readFileSync(fileURLToPath(new URL("./test-shim.sql", import.meta.url)), "utf8");
const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

export function pgliteDb(pg: PGlite): Db {
  return {
    async query<T = any>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params as any[]);
      return res.rows;
    },
  };
}

export async function createTestDb(opts: { migrations?: boolean } = {}): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  await pg.exec(SHIM);
  if (opts.migrations !== false) {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.includes("storage"))
      .sort();
    for (const f of files) await pg.exec(readFileSync(MIGRATIONS_DIR + f, "utf8"));
  }
  return { db: pgliteDb(pg), pg };
}

export async function seedTestBrand(
  db: Db,
  o: Partial<{ slug: string; timezone: string; approval_mode: string; status: string; publisher: string | null }> = {}
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into brands (slug, name, timezone, approval_mode, status, publisher)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [o.slug ?? `brand-${randomUUID().slice(0, 8)}`, "Test Brand", o.timezone ?? "Europe/Brussels",
     o.approval_mode ?? "review", o.status ?? "active", o.publisher ?? null]
  );
  return row.id;
}

export async function addTestMember(db: Db, brandId: string, email: string, role = "owner"): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into brand_members (brand_id, user_id, role) values ($1, $2, $3)", [brandId, id, role]);
  return id;
}
