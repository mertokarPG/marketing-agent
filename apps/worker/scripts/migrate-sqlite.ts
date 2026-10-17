import "dotenv/config";
import Database from "better-sqlite3";
import { createPostgresDb, getBrandBySlug } from "@carepost/core";
import { migrateSqlite } from "./lib/migrate-sqlite.js";

const [file = "marketing-agent.db", slug = "carephoto"] = process.argv.slice(2);
const db = createPostgresDb(process.env.DATABASE_URL!);
const brand = await getBrandBySlug(db, slug);
if (!brand) throw new Error(`Seed brand ${slug} first (npm run seed-brand).`);
console.log(await migrateSqlite(new Database(file, { readonly: true }), db, brand.id));
await db.end();
