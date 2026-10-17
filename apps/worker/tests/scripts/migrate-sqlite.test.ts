import { it, expect } from "vitest";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { createLegacySqlite } from "../../scripts/legacy/sqlite-schema.js";
import { migrateSqlite } from "../../scripts/lib/migrate-sqlite.js";

const ZERO = { posts: 0, metrics: 0, trends: 0, competitors: 0 };
const countAll = async (db: any) => ({
  posts: (await db.query("select count(*)::int n from posts"))[0].n,
  metrics: (await db.query("select count(*)::int n from post_metrics"))[0].n,
  trends: (await db.query("select count(*)::int n from trends"))[0].n,
  competitors: (await db.query("select count(*)::int n from competitor_snapshots"))[0].n,
});

function legacy() {
  const sqlite = createLegacySqlite(":memory:");
  sqlite.prepare(`insert into posts (brand_id, caption, hashtags, image_url, posted_at, external_post_id, source_images, is_outlier, notes)
    values ('carephoto', 'Old post', '["#a"]', 'https://img/1.png', '2026-04-01T10:00:00Z', 'pz-1', '["p1"]', 1, 'boosted')`).run();
  sqlite.prepare(`insert into analytics (post_id, brand_id, likes, reach, measured_at) values (1, 'carephoto', 12, 300, '2026-04-02 09:00:00')`).run();
  sqlite.prepare(`insert into trends (source_id, category, title, url, score) values ('hn','tech','T','https://t/1', 5)`).run();
  sqlite.prepare(`insert into competitor_snapshots (brand_id, competitor_name, content_summary, scraped_at) values ('carephoto','Remini','s','2026-04-03 08:00:00')`).run();
  return sqlite;
}

it("imports legacy posts, analytics, trends and competitors", async () => {
  const sqlite = legacy();
  const { db } = await createTestDb();
  const brandId = await seedTestBrand(db, { slug: "carephoto" });
  expect(await migrateSqlite(sqlite, db, brandId)).toEqual({ posts: 1, metrics: 1, trends: 1, competitors: 1 });
  const [p] = await db.query("select status, kind, caption, prompt_ids, external_post_id, is_outlier, notes, import_ref from posts");
  expect(p).toMatchObject({ status: "published", kind: "core", caption: "Old post", prompt_ids: ["p1"], external_post_id: "pz-1", is_outlier: true, import_ref: "sqlite:1" });
  expect(p.notes).toBe("https://img/1.png boosted");
  const before = await countAll(db);
  expect(await migrateSqlite(sqlite, db, brandId)).toEqual(ZERO);
  expect(await countAll(db)).toEqual(before);
});

it("matches import refs exactly: ids 1 and 10 both import and neither re-imports", async () => {
  const sqlite = createLegacySqlite(":memory:");
  const ins = sqlite.prepare("insert into posts (id, brand_id, caption) values (?, 'carephoto', ?)");
  ins.run(1, "one"); ins.run(10, "ten");
  const { db } = await createTestDb();
  const brandId = await seedTestBrand(db, { slug: "carephoto" });
  expect((await migrateSqlite(sqlite, db, brandId)).posts).toBe(2);
  expect((await migrateSqlite(sqlite, db, brandId)).posts).toBe(0);
  expect(await db.query("select import_ref from posts order by import_ref")).toEqual([{ import_ref: "sqlite:1" }, { import_ref: "sqlite:10" }]);
});

it("completes a partial run: posts present but metrics missing", async () => {
  const sqlite = legacy();
  const { db } = await createTestDb();
  const brandId = await seedTestBrand(db, { slug: "carephoto" });
  await migrateSqlite(sqlite, db, brandId);
  await db.query("delete from post_metrics");
  await db.query("delete from trends");
  await db.query("delete from competitor_snapshots");
  expect(await migrateSqlite(sqlite, db, brandId)).toEqual({ posts: 0, metrics: 1, trends: 1, competitors: 1 });
  expect(await countAll(db)).toEqual({ posts: 1, metrics: 1, trends: 1, competitors: 1 });
});
