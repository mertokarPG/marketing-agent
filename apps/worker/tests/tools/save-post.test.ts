import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStorage, enqueueRun, type BrandConfig, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand, addTestMember } from "@carepost/core/testing";
import { savePost } from "../../src/tools/save-post.js";
import type { ToolContext } from "../../src/runtime/types.js";

let db: Db;
let storage: MemoryStorage;
let brand: BrandConfig;
let img: string;
const notify = vi.fn().mockResolvedValue("ok");

const window = { start: new Date("2026-10-18T22:00:00Z"), end: new Date("2026-10-25T23:00:00Z") };
const input = (o = {}) => ({
  caption: "Barrier care", hashtags: ["#skin"], images: [img], promptIds: [],
  plannedAt: "2026-10-19T08:00:00.000Z", kind: "core" as const, rationale: "why", ...o,
});

async function setup(approvalMode: "review" | "autopilot") {
  ({ db } = await createTestDb());
  const dbId = await seedTestBrand(db, { approval_mode: approvalMode });
  await addTestMember(db, dbId, "owner@kuanyin.be");
  brand = { dbId, slug: "k", name: "K", timezone: "Europe/Brussels", approvalMode } as unknown as BrandConfig;
  storage = new MemoryStorage();
  img = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "img-")), "slide.png");
  fs.writeFileSync(img, "PNG");
  notify.mockClear();
}
const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({ storage, runId: null, kind: "weekly_plan", window, notify, ...o });
const rows = () => db.query<any>("select * from posts order by planned_at");

describe("savePost", () => {
  beforeEach(() => setup("review"));

  it("uploads media then inserts a pending draft", async () => {
    const msg = await savePost(db, brand, ctx(), input());
    const [p] = await rows();
    expect(msg).toContain(p.id);
    expect(p.status).toBe("pending_approval");
    expect(p.media).toEqual([{ storage_path: `${brand.dbId}/${p.id}/0.png` }]);
    expect(storage.files.get(`post-media/${brand.dbId}/${p.id}/0.png`)?.contentType).toBe("image/png");
  });

  it("rejects plannedAt outside the run window", async () => {
    const msg = await savePost(db, brand, ctx(), input({ plannedAt: "2026-11-02T08:00:00Z" }));
    expect(msg).toMatch(/outside the allowed window/);
    expect(await rows()).toHaveLength(0);
  });

  it("refuses a second core post on the same local date (weekly retry)", async () => {
    await savePost(db, brand, ctx(), input());
    const msg = await savePost(db, brand, ctx(), input({ plannedAt: "2026-10-19T15:00:00Z" }));
    expect(msg).toMatch(/already has a core post/);
    await savePost(db, brand, ctx(), input({ plannedAt: "2026-10-20T08:00:00Z" }));
    expect(await rows()).toHaveLength(2);
  });

  it("refuses a same-date core post even when two saves run in parallel", async () => {
    const msgs = await Promise.all([
      savePost(db, brand, ctx(), input()),
      savePost(db, brand, ctx(), input({ plannedAt: "2026-10-19T15:00:00Z" })),
    ]);
    expect(msgs.filter((m) => /already has a core post/.test(m))).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });

  it("allows at most one timely post per daily run and notifies members in review mode", async () => {
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    const c = ctx({ kind: "daily_check", runId });
    await savePost(db, brand, c, input({ kind: "timely" }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("needs your OK"), expect.any(String), ["owner@kuanyin.be"]);
    const msg = await savePost(db, brand, c, input({ kind: "timely", plannedAt: "2026-10-19T12:00:00Z" }));
    expect(msg).toMatch(/at most one timely post/);
    expect(await rows()).toHaveLength(1);
  });

  it("allows at most one timely post when a daily run saves two in parallel", async () => {
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    const c = ctx({ kind: "daily_check", runId });
    await Promise.all([
      savePost(db, brand, c, input({ kind: "timely" })),
      savePost(db, brand, c, input({ kind: "timely", plannedAt: "2026-10-19T12:00:00Z" })),
    ]);
    expect(await rows()).toHaveLength(1);
  });

  it("rejects a core post from a daily check", async () => {
    expect(await savePost(db, brand, ctx({ kind: "daily_check" }), input())).toMatch(/must be "timely"/);
  });

  it("leaves no row when an upload fails", async () => {
    storage.failUploads = true;
    const msg = await savePost(db, brand, ctx(), input());
    expect(msg).toMatch(/save_post failed/);
    expect(await rows()).toHaveLength(0);
  });

  it("approves immediately in autopilot without notifying", async () => {
    await setup("autopilot");
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    await savePost(db, brand, ctx({ kind: "daily_check", runId }), input({ kind: "timely" }));
    expect((await rows())[0].status).toBe("approved");
    expect(notify).not.toHaveBeenCalled();
  });
});
