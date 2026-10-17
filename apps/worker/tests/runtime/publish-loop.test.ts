import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryStorage, insertPost, approvePost, type Db } from "@carepost/core";
import { createTestDb, seedTestBrand } from "@carepost/core/testing";
import { publishTick } from "../../src/runtime/publish-loop.js";

let db: Db;
let storage: MemoryStorage;
let brand: string;
const publish = vi.fn();
const notify = vi.fn().mockResolvedValue("ok");
const deps = () => ({ db, storage, publishers: { postiz: { name: "postiz" as const, publish } }, notify });
const post = (o: any = {}) => insertPost(db, {
  brand_id: brand, kind: "core", status: "approved", planned_at: new Date(Date.now() - 1000),
  caption: "c", hashtags: ["#h"], media: [{ storage_path: `${brand}/p/0.png` }, { storage_path: `${brand}/p/1.png` }],
  prompt_ids: [], rationale: "", ...o,
});
const status = async (id: string) => (await db.query<any>("select status, external_post_id, publish_error from posts where id = $1", [id]))[0];

beforeEach(async () => {
  ({ db } = await createTestDb());
  brand = await seedTestBrand(db, { publisher: "postiz" });
  storage = new MemoryStorage();
  publish.mockReset();
  notify.mockReset();
  notify.mockResolvedValue("ok");
});

describe("publishTick", () => {
  it("publishes due approved posts with freshly signed 1h URLs", async () => {
    publish.mockResolvedValue({ externalId: "ext-9" });
    const id = await post();
    expect(storage.signedCalls).toHaveLength(0);
    expect(await publishTick(deps())).toEqual({ expired: 0, published: 1, failed: 0 });
    expect(storage.signedCalls.map((c) => c.ttlSec)).toEqual([3600, 3600]);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      id, caption: "c", hashtags: ["#h"],
      mediaUrls: [`memory://post-media/${brand}/p/0.png?ttl=3600`, `memory://post-media/${brand}/p/1.png?ttl=3600`],
    }));
    expect(await status(id)).toMatchObject({ status: "published", external_post_id: "ext-9" });
  });

  it("expires late drafts and never publishes them, even if approval arrives after", async () => {
    const id = await post({ status: "pending_approval" });
    expect((await publishTick(deps())).expired).toBe(1);
    expect(await approvePost(db, brand, id)).toBe(false);
    await publishTick(deps());
    expect(publish).not.toHaveBeenCalled();
    expect((await status(id)).status).toBe("expired");
  });

  it("marks failures and notifies the owner without retrying", async () => {
    publish.mockRejectedValue(new Error("postiz 500"));
    const id = await post();
    expect(await publishTick(deps())).toEqual({ expired: 0, published: 0, failed: 1 });
    expect(await status(id)).toMatchObject({ status: "failed", publish_error: "postiz 500" });
    expect(notify).toHaveBeenCalledTimes(1);
    await publishTick(deps());
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("a failing notify does not break the loop; later posts still publish", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    notify.mockRejectedValue(new Error("smtp down"));
    publish.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ externalId: "ok-2" });
    const a = await post({ planned_at: new Date(Date.now() - 2000) });
    const b = await post();
    expect(await publishTick(deps())).toEqual({ expired: 0, published: 1, failed: 1 });
    expect((await status(a)).status).toBe("failed");
    expect((await status(b)).status).toBe("published");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("leaves future posts and brands without a publisher alone", async () => {
    const future = await post({ planned_at: new Date(Date.now() + 3600_000) });
    const noPub = await seedTestBrand(db, { publisher: null });
    const waiting = await insertPost(db, { brand_id: noPub, kind: "core", status: "approved", planned_at: new Date(Date.now() - 1000),
      caption: "w", hashtags: [], media: [], prompt_ids: [], rationale: "" });
    await publishTick(deps());
    expect(publish).not.toHaveBeenCalled();
    expect((await status(future)).status).toBe("approved");
    expect((await status(waiting)).status).toBe("approved");
  });
});
