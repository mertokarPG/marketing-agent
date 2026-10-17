import "dotenv/config";
import path from "node:path";
import { createPostgresDb, createSupabaseStorage } from "@carepost/core";
import { seedBrandFromDir } from "./lib/seed-brand.js";

const [dir, email] = process.argv.slice(2);
if (!dir || !email) { console.error("Usage: npm run seed-brand -- <brands/slug> <owner-email>"); process.exit(1); }
const db = createPostgresDb(process.env.DATABASE_URL!);
const storage = createSupabaseStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
console.log("seeded brand", await seedBrandFromDir({ db, storage }, path.resolve(dir), email));
await db.end();
