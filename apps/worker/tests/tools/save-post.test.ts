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
let brandDir: string;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
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
  brandDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "save-post-")), "brand");
  fs.mkdirSync(brandDir);
  brand = { dbId, slug: "k", name: "K", timezone: "Europe/Brussels", approvalMode, brandDir } as unknown as BrandConfig;
  storage = new MemoryStorage();
  img = path.join(brandDir, "slide.png");
  fs.writeFileSync(img, PNG);
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

  it("rejects an empty caption, more than 5 hashtags, or a caption too long for Instagram", async () => {
    expect(await savePost(db, brand, ctx(), input({ caption: " \n " }))).toMatch(/^save_post rejected: the caption is empty/);
    expect(await savePost(db, brand, ctx(), input({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] }))).toMatch(/^save_post rejected: use at most 5 hashtags/);
    expect(await savePost(db, brand, ctx(), input({ caption: "x".repeat(2195), hashtags: ["#skin"] }))).toMatch(/^save_post rejected: caption plus hashtags exceed/);
    expect(await rows()).toHaveLength(0);
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

  it("returns the saved message plus the error when the timely notification fails", async () => {
    notify.mockRejectedValueOnce(new Error("smtp down"));
    const runId = await enqueueRun(db, brand.dbId, "daily_check", "2026-10-19");
    const msg = await savePost(db, brand, ctx({ kind: "daily_check", runId }), input({ kind: "timely" }));
    expect(msg).toMatch(/^Saved timely post .*; notification failed: smtp down$/);
    expect(await rows()).toHaveLength(1);
  });
});

describe("savePost image sources", () => {
  beforeEach(() => setup("review"));
  const lookup = vi.fn();
  const fetchFn = vi.fn();
  const deps = { lookup, fetch: fetchFn as unknown as typeof fetch };
  beforeEach(() => { lookup.mockReset(); fetchFn.mockReset(); });

  async function rejected(images: string[], d = deps) {
    const msg = await savePost(db, brand, ctx(), input({ images }), d);
    expect(msg).toMatch(/^save_post rejected: /);
    expect(await rows()).toHaveLength(0);
    expect(storage.files.size).toBe(0);
    return msg;
  }

  it("saves a product photo by its listed relative path, typed from its bytes", async () => {
    fs.mkdirSync(path.join(brandDir, "assets/products"), { recursive: true });
    fs.writeFileSync(path.join(brandDir, "assets/products/serum.jpg"), JPEG);
    await savePost(db, brand, ctx(), input({ images: ["assets/products/serum.jpg"] }));
    const [p] = await rows();
    expect(p.media).toEqual([{ storage_path: `${brand.dbId}/${p.id}/0.jpg` }]);
    expect(storage.files.get(`post-media/${brand.dbId}/${p.id}/0.jpg`)?.contentType).toBe("image/jpeg");
  });

  it("accepts a PNG rendered under the worker tmp dir", async () => {
    const dir = fs.mkdtempSync(path.join(path.resolve("tmp"), "save-post-test-"));
    try {
      const file = path.join(dir, "cover.png");
      fs.writeFileSync(file, PNG);
      expect(await savePost(db, brand, ctx(), input({ images: [file] }))).toMatch(/^Saved core post/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects /etc/passwd", async () => {
    expect(await rejected(["/etc/passwd"])).toMatch(/outside the brand and render directories/);
  });

  it("rejects ../ traversal out of brandDir", async () => {
    fs.writeFileSync(path.join(brandDir, "..", "outside.png"), PNG);
    expect(await rejected(["../outside.png"])).toMatch(/outside/);
  });

  it("rejects a symlink inside brandDir pointing outside", async () => {
    const outside = path.join(brandDir, "..", "secret.png");
    fs.writeFileSync(outside, PNG);
    fs.symlinkSync(outside, path.join(brandDir, "link.png"));
    expect(await rejected(["link.png"])).toMatch(/outside/);
  });

  it("rejects a non-image file inside brandDir", async () => {
    fs.writeFileSync(path.join(brandDir, "notes.png"), "just text");
    expect(await rejected(["notes.png"])).toMatch(/not a PNG, JPEG or WebP/);
  });

  it("rejects plain http and loopback/metadata IPs without fetching", async () => {
    await rejected(["http://127.0.0.1/x.png"]);
    await rejected(["http://169.254.169.254/"]);
    expect(await rejected(["https://169.254.169.254/latest/meta-data"])).toMatch(/non-public address/);
    expect(await rejected(["https://127.0.0.1/x.png"])).toMatch(/non-public address/);
    expect(await rejected(["https://[::1]/x.png"])).toMatch(/non-public address/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects an https host that resolves to a private address (checked at connect time)", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    // Real undici fetch + guarded dispatcher; the injected resolver keeps it offline.
    expect(await rejected(["https://internal.example.com/x.png"], { lookup } as any)).toMatch(/non-public address/);
    expect(lookup).toHaveBeenCalledWith("internal.example.com");
  });

  it("saves a public https image", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchFn.mockResolvedValue(new Response(PNG, { status: 200 }));
    expect(await savePost(db, brand, ctx(), input({ images: ["https://cdn.example.com/a"] }), deps)).toMatch(/^Saved core post/);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });
});
