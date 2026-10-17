import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../../src/tools/schedule-post.js", () => ({ schedulePost: vi.fn() }));
import { schedulePost } from "../../src/tools/schedule-post.js";
import { postizPublisher } from "../../src/publishers/postiz.js";

beforeEach(() => { process.env.POSTIZ_BRAND_ID = "b"; vi.mocked(schedulePost).mockReset(); });

it("publishes now via Postiz with the signed URLs", async () => {
  (schedulePost as any).mockResolvedValue({ ok: true, message: "ok", postizId: "pz-1" });
  const r = await postizPublisher().publish({ id: "p", brandId: "b", caption: "c", hashtags: ["#h"], mediaUrls: ["https://s/1"] });
  expect(schedulePost).toHaveBeenCalledWith({ caption: "c", hashtags: ["#h"], images: ["https://s/1"] });
  expect(r).toEqual({ externalId: "pz-1" });
});

it("throws when Postiz reports failure", async () => {
  (schedulePost as any).mockResolvedValue({ ok: false, message: "Postiz API key not configured." });
  await expect(postizPublisher().publish({ id: "p", brandId: "b", caption: "c", hashtags: [], mediaUrls: [] }))
    .rejects.toThrow(/not configured/);
});

it("refuses other brands or an unset POSTIZ_BRAND_ID", async () => {
  await expect(postizPublisher().publish({ id: "p", brandId: "other", caption: "c", hashtags: [], mediaUrls: [] })).rejects.toThrow(/refusing/);
  delete process.env.POSTIZ_BRAND_ID;
  await expect(postizPublisher().publish({ id: "p", brandId: "b", caption: "c", hashtags: [], mediaUrls: [] })).rejects.toThrow(/unset/);
  expect(schedulePost).not.toHaveBeenCalled();
});
