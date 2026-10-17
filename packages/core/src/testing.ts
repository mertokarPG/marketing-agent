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
