import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, seedTestBrand, addTestMember } from "../src/testing.js";
import type { Db } from "../src/db.js";

let db: Db;
let pg: PGlite;
let brandA: string;
let brandB: string;
let owner: string;
let editor: string;
let viewer: string;
const stranger = "99999999-9999-9999-9999-999999999999";

beforeEach(async () => {
  ({ db, pg } = await createTestDb());
  brandA = await seedTestBrand(db, { slug: "brand-a" });
  brandB = await seedTestBrand(db, { slug: "brand-b" });
  owner = await addTestMember(db, brandA, "owner@example.com", "owner");
  editor = await addTestMember(db, brandA, "editor@example.com", "editor");
  viewer = await addTestMember(db, brandA, "viewer@example.com", "viewer");
});

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await pg.query("set role authenticated");
  try { return await fn(); } finally { await pg.query("reset role"); }
}

const FUTURE = "now() + interval '2 days'";

async function post(
  brand: string,
  o: Partial<{ status: string; plannedAt: string; needsNewTime: boolean; media: unknown[] }> = {}
): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    `insert into posts (brand_id, kind, status, planned_at, caption, hashtags, media, needs_new_time)
     values ($1,'core',$2,${o.plannedAt ?? FUTURE},'original caption', '{"#a"}', $3::jsonb, $4) returning id`,
    [brand, o.status ?? "pending_approval", JSON.stringify(o.media ?? []), o.needsNewTime ?? false]);
  return r.id;
}

type PostRow = {
  status: string; caption: string; hashtags: string[]; media: any[]; planned_at: Date;
  needs_new_time: boolean; last_changed_by: string | null; last_changed_at: Date | null;
};
const getPost = async (id: string) => (await db.query<PostRow>("select * from posts where id = $1", [id]))[0];

const call = (user: string, sql: string, params: unknown[]) => asUser(user, () => db.query(sql, params));

describe("dashboard RPCs", () => {
  describe("approve", () => {
    it("owner approves a pending post", async () => {
      const id = await post(brandA);
      await call(owner, "select approve_post($1)", [id]);
      const p = await getPost(id);
      expect(p.status).toBe("approved");
      expect(p.last_changed_by).toBe(owner);
      expect(p.last_changed_at).not.toBeNull();
    });

    it("editor can approve", async () => {
      const id = await post(brandA);
      await call(editor, "select approve_post($1)", [id]);
      expect((await getPost(id)).status).toBe("approved");
    });

    it("viewer cannot approve", async () => {
      const id = await post(brandA);
      await expect(call(viewer, "select approve_post($1)", [id])).rejects.toThrow(/carepost:not_allowed/);
      expect((await getPost(id)).status).toBe("pending_approval");
    });

    it("stranger cannot approve", async () => {
      const id = await post(brandA);
      await expect(call(stranger, "select approve_post($1)", [id])).rejects.toThrow(/carepost:not_allowed/);
    });

    it("member of another brand cannot approve", async () => {
      const id = await post(brandB);
      await expect(call(owner, "select approve_post($1)", [id])).rejects.toThrow(/carepost:not_allowed/);
      expect((await getPost(id)).status).toBe("pending_approval");
    });

    it("unknown post is not_found", async () => {
      await expect(call(owner, "select approve_post($1)", ["11111111-1111-1111-1111-111111111111"]))
        .rejects.toThrow(/carepost:not_found/);
    });

    it("approve refuses past posts", async () => {
      const id = await post(brandA, { plannedAt: "now() - interval '1 hour'" });
      await expect(call(owner, "select approve_post($1)", [id])).rejects.toThrow(/carepost:in_past/);
    });

    it("approve refuses needs_new_time posts", async () => {
      const id = await post(brandA, { needsNewTime: true });
      await expect(call(owner, "select approve_post($1)", [id])).rejects.toThrow(/carepost:needs_new_time/);
    });

    it("refuses non-editable statuses", async () => {
      const id = await post(brandA, { status: "published" });
      await expect(call(owner, "select approve_post($1)", [id])).rejects.toThrow(/carepost:not_editable/);
    });
  });

  it("unapprove moves approved back to pending_approval", async () => {
    const id = await post(brandA, { status: "approved" });
    await call(editor, "select unapprove_post($1)", [id]);
    expect((await getPost(id)).status).toBe("pending_approval");
  });

  it("skip rejects pending and approved posts", async () => {
    const a = await post(brandA);
    const b = await post(brandA, { status: "approved" });
    await call(owner, "select skip_post($1)", [a]);
    await call(owner, "select skip_post($1)", [b]);
    expect((await getPost(a)).status).toBe("rejected");
    expect((await getPost(b)).status).toBe("rejected");
    await expect(call(owner, "select skip_post($1)", [a])).rejects.toThrow(/carepost:not_editable/);
  });

  it("editing an approved post keeps it approved and records last_changed_by", async () => {
    const id = await post(brandA, { status: "approved" });
    await call(editor, "select update_post_caption($1, $2, $3)", [id, "new caption", ["#x", "#y"]]);
    const p = await getPost(id);
    expect(p.status).toBe("approved");
    expect(p.caption).toBe("new caption");
    expect(p.hashtags).toEqual(["#x", "#y"]);
    expect(p.last_changed_by).toBe(editor);
  });

  it("caption over 2200 characters is refused", async () => {
    const id = await post(brandA);
    await call(owner, "select update_post_caption($1, $2, $3)", [id, "x".repeat(2200), []]);
    await expect(call(owner, "select update_post_caption($1, $2, $3)", [id, "x".repeat(2201), []]))
      .rejects.toThrow(/carepost:caption_too_long/);
    await expect(call(owner, "select update_post_caption($1, $2, $3)", [id, "   ", []]))
      .rejects.toThrow(/carepost:invalid_input/);
  });

  it("viewer cannot edit a caption", async () => {
    const id = await post(brandA);
    await expect(call(viewer, "select update_post_caption($1, $2, $3)", [id, "hi", []]))
      .rejects.toThrow(/carepost:not_allowed/);
  });

  it("reschedule refuses the past and clears needs_new_time", async () => {
    const id = await post(brandA, { needsNewTime: true, plannedAt: "now() - interval '1 hour'" });
    await expect(call(owner, "select reschedule_post($1, now() - interval '1 minute')", [id]))
      .rejects.toThrow(/carepost:in_past/);
    const when = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await call(owner, "select reschedule_post($1, $2)", [id, when.toISOString()]);
    const p = await getPost(id);
    expect(p.needs_new_time).toBe(false);
    expect(new Date(p.planned_at).getTime()).toBe(when.getTime());
    expect(p.last_changed_by).toBe(owner);
  });

  describe("update_post_media", () => {
    let id: string;
    let productPath: string;
    beforeEach(async () => {
      id = await post(brandA);
      productPath = `${brandA}/products/rose.png`;
      await db.query("insert into brand_assets (brand_id, kind, storage_path) values ($1,'product',$2)", [brandA, productPath]);
      await db.query("insert into brand_assets (brand_id, kind, storage_path) values ($1,'logo',$2)", [brandA, `${brandA}/logo.png`]);
      await db.query("insert into brand_assets (brand_id, kind, storage_path) values ($1,'product',$2)", [brandB, `${brandB}/products/b.png`]);
    });
    const setMedia = (media: unknown, user = owner) =>
      call(user, "select update_post_media($1, $2::jsonb)", [id, JSON.stringify(media)]);

    it("rejects foreign and non-product paths", async () => {
      const bad: unknown[] = [
        [{ storage_path: `${brandB}/${id}/1.png` }],
        [{ storage_path: `${brandA}/${id}/../other/1.png` }],
        [{ storage_path: `${brandA}/11111111-1111-1111-1111-111111111111/1.png` }],
        [{ storage_path: `${brandA}/logo.png`, bucket: "brand-assets" }],
        [{ storage_path: `${brandB}/products/b.png`, bucket: "brand-assets" }],
        [{ storage_path: productPath, bucket: "other-bucket" }],
        [{ storage_path: productPath }],
        [{ path: `${brandA}/${id}/1.png` }],
        [],
        Array.from({ length: 11 }, (_, i) => ({ storage_path: `${brandA}/${id}/${i}.png` })),
        { storage_path: `${brandA}/${id}/1.png` },
      ];
      for (const m of bad) await expect(setMedia(m), JSON.stringify(m)).rejects.toThrow(/carepost:invalid_media/);
      await expect(call(owner, "select update_post_media($1, null)", [id])).rejects.toThrow(/carepost:invalid_media/);
    });

    it("accepts a reorder and a product asset", async () => {
      const a = { storage_path: `${brandA}/${id}/1.png`, width: 1080, height: 1350 };
      const b = { storage_path: `${brandA}/${id}/2.png` };
      const prod = { storage_path: productPath, bucket: "brand-assets" };
      await setMedia([b, a, prod]);
      const p = await getPost(id);
      expect(p.media).toEqual([b, a, prod]);
      expect(p.last_changed_by).toBe(owner);
    });

    it("viewer cannot change media", async () => {
      await expect(setMedia([{ storage_path: `${brandA}/${id}/1.png` }], viewer)).rejects.toThrow(/carepost:not_allowed/);
    });
  });

  describe("redo", () => {
    const redo = (id: string, feedback = "more playful", user = owner) =>
      call(user, "select request_post_redo($1, $2) as id", [id, feedback]) as Promise<{ id: string }[]>;

    it("request_post_redo snapshots, locks and enqueues", async () => {
      const id = await post(brandA);
      const [{ id: revId }] = await redo(id, "  more playful  ");
      expect(revId).toMatch(/^[0-9a-f-]{36}$/);
      const p = await getPost(id);
      expect(p.status).toBe("reworking");
      const versions = await db.query<{ feedback: string; reason: string; caption: string; created_by: string }>(
        "select * from post_versions where post_id = $1", [id]);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ feedback: "more playful", reason: "redo", caption: "original caption", created_by: owner });
      const [rev] = await db.query<{ id: string; prior_status: string; status: string; requested_by: string; version_id: string }>(
        "select * from post_revisions where post_id = $1", [id]);
      expect(rev).toMatchObject({ id: revId, prior_status: "pending_approval", status: "queued", requested_by: owner });
      const runs = await db.query<{ kind: string; status: string; period_key: string; brand_id: string }>(
        "select * from agent_runs where kind = 'revise'");
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ kind: "revise", status: "queued", period_key: revId, brand_id: brandA });
    });

    it("refuses empty and over-long feedback", async () => {
      const id = await post(brandA);
      await expect(redo(id, "   ")).rejects.toThrow(/carepost:invalid_input/);
      await expect(redo(id, "x".repeat(501))).rejects.toThrow(/carepost:invalid_input/);
    });

    it("viewer cannot redo", async () => {
      const id = await post(brandA);
      await expect(redo(id, "x", viewer)).rejects.toThrow(/carepost:not_allowed/);
    });

    it("fourth redo hits the limit; failed revisions don't count", async () => {
      const id = await post(brandA);
      for (let i = 0; i < 3; i++) {
        await redo(id);
        await db.query("update posts set status = 'pending_approval' where id = $1", [id]);
        await db.query("update post_revisions set status = 'done' where post_id = $1", [id]);
      }
      await expect(redo(id)).rejects.toThrow(/carepost:redo_limit/);
      await db.query(
        "update post_revisions set status = 'failed' where id = (select id from post_revisions where post_id = $1 order by created_at limit 1)", [id]);
      await redo(id);
      expect((await getPost(id)).status).toBe("reworking");
    });

    it("refuses within 30 minutes of the posting time", async () => {
      const id = await post(brandA, { plannedAt: "now() + interval '20 minutes'" });
      await expect(redo(id)).rejects.toThrow(/carepost:too_close/);
    });

    it("refuses for a paused brand", async () => {
      await db.query("update brands set status = 'paused' where id = $1", [brandA]);
      const id = await post(brandA);
      await expect(redo(id)).rejects.toThrow(/carepost:paused/);
    });

    it("all edits are refused while reworking", async () => {
      const id = await post(brandA, { status: "reworking" });
      const when = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      const attempts: [string, unknown[]][] = [
        ["select approve_post($1)", [id]],
        ["select unapprove_post($1)", [id]],
        ["select skip_post($1)", [id]],
        ["select update_post_caption($1, 'c', '{}')", [id]],
        ["select reschedule_post($1, $2)", [id, when]],
        ["select update_post_media($1, $2::jsonb)", [id, JSON.stringify([{ storage_path: `${brandA}/${id}/1.png` }])]],
        ["select request_post_redo($1, 'again')", [id]],
      ];
      for (const [sql, params] of attempts) {
        await expect(call(owner, sql, params), sql).rejects.toThrow(/carepost:reworking/);
      }
    });

    it("concurrent redo after approve is refused", async () => {
      const id = await post(brandA);
      await call(owner, "select approve_post($1)", [id]);
      await redo(id, "shorter caption", editor);
      const [rev] = await db.query<{ prior_status: string }>("select prior_status from post_revisions where post_id = $1", [id]);
      expect(rev.prior_status).toBe("approved");
      await expect(redo(id, "more playful", owner)).rejects.toThrow(/carepost:reworking/);
      expect(await db.query("select 1 from post_revisions where post_id = $1", [id])).toHaveLength(1);
    });
  });

  describe("restore_post_version", () => {
    it("swaps in the old version and snapshots the current one", async () => {
      const media = [{ storage_path: `${brandA}/PLACEHOLDER/1.png` }];
      const id = await post(brandA, { status: "approved" });
      const oldPlanned = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
      const [v] = await db.query<{ id: string }>(
        `insert into post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason, feedback)
         values ($1,$2,'old caption','{"#old"}',$3::jsonb,$4,'redo','more playful') returning id`,
        [id, brandA, JSON.stringify(media), oldPlanned]);
      await call(editor, "select restore_post_version($1)", [v.id]);
      const p = await getPost(id);
      expect(p.status).toBe("approved");
      expect(p.caption).toBe("old caption");
      expect(p.hashtags).toEqual(["#old"]);
      expect(p.media).toEqual(media);
      expect(new Date(p.planned_at).toISOString()).toBe(oldPlanned);
      expect(p.last_changed_by).toBe(editor);
      const snaps = await db.query<{ caption: string; created_by: string }>(
        "select caption, created_by from post_versions where post_id = $1 and reason = 'restore'", [id]);
      expect(snaps).toEqual([{ caption: "original caption", created_by: editor }]);
    });

    it("refuses viewers, strangers, other brands, unknown versions and reworking posts", async () => {
      const idB = await post(brandB);
      const [vB] = await db.query<{ id: string }>(
        `insert into post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason)
         values ($1,$2,'b','{}','[]', now() + interval '1 day','redo') returning id`, [idB, brandB]);
      await expect(call(owner, "select restore_post_version($1)", [vB.id])).rejects.toThrow(/carepost:not_allowed/);
      await expect(call(stranger, "select restore_post_version($1)", [vB.id])).rejects.toThrow(/carepost:not_allowed/);
      await expect(call(owner, "select restore_post_version($1)", ["11111111-1111-1111-1111-111111111111"]))
        .rejects.toThrow(/carepost:not_found/);

      const idA = await post(brandA, { status: "reworking" });
      const [vA] = await db.query<{ id: string }>(
        `insert into post_versions (post_id, brand_id, caption, hashtags, media, planned_at, reason)
         values ($1,$2,'a','{}','[]', now() + interval '1 day','redo') returning id`, [idA, brandA]);
      await expect(call(viewer, "select restore_post_version($1)", [vA.id])).rejects.toThrow(/carepost:not_allowed/);
      await expect(call(owner, "select restore_post_version($1)", [vA.id])).rejects.toThrow(/carepost:reworking/);
      expect((await getPost(idB)).caption).toBe("original caption");
    });
  });

  it("anon cannot execute the RPCs", async () => {
    const id = await post(brandA);
    await pg.query("set role anon");
    try {
      await expect(db.query("select approve_post($1)", [id])).rejects.toThrow(/permission denied/);
    } finally { await pg.query("reset role"); }
  });

  it("the internal lock helper is not callable by authenticated", async () => {
    const id = await post(brandA);
    await expect(call(owner, "select _carepost_lock_post($1)", [id])).rejects.toThrow(/permission denied/);
  });
});
