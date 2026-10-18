import { it, expect } from "vitest";
import { planLegacyAttachments } from "../scripts/lib/attach-legacy-images.js";

const has = (...ps: string[]) => (p: string) => ps.includes(p);

it("plans posts with empty media whose file exists, parsing the path from notes with other text", () => {
  const rows = [{ id: "a", notes: "/x/tmp/a.png boosted post", media: [] }, { id: "b", notes: "/x/tmp/b.jpg", media: [] }];
  expect(planLegacyAttachments(rows, has("/x/tmp/a.png", "/x/tmp/b.jpg"))).toEqual([
    { postId: "a", file: "/x/tmp/a.png" }, { postId: "b", file: "/x/tmp/b.jpg" }]);
});
it("skips missing files, non-path notes, null notes and posts that already have media", () => {
  const rows = [
    { id: "a", notes: "/x/gone.png", media: [] },
    { id: "b", notes: "https://img/1.png boosted", media: [] },
    { id: "c", notes: null, media: [] },
    { id: "d", notes: "/x/d.png", media: [{ storage_path: "s" }] },
  ];
  expect(planLegacyAttachments(rows, has("/x/d.png"))).toEqual([]);
});
it("drops a file referenced by more than one post", () => {
  const rows = [{ id: "a", notes: "/x/s.png", media: [] }, { id: "b", notes: "/x/s.png extra", media: [] }, { id: "c", notes: "/x/c.png", media: [] }];
  expect(planLegacyAttachments(rows, has("/x/s.png", "/x/c.png"))).toEqual([{ postId: "c", file: "/x/c.png" }]);
});
