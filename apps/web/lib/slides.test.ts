import { describe, it, expect } from "vitest";
import { moveSlide, removeSlide, addProduct, cleanMedia, MAX_SLIDES, type MediaItem } from "./slides";
import { redoFeedback } from "./redo";

const m = (n: number): MediaItem[] => Array.from({ length: n }, (_, i) => ({ storage_path: `b/p/${i + 1}.jpg` }));
const paths = (xs: MediaItem[] | null) => xs?.map((x) => x.storage_path);

describe("moveSlide", () => {
  it("moves a slide forward and back", () => {
    expect(paths(moveSlide(m(4), 0, 2))).toEqual(["b/p/2.jpg", "b/p/3.jpg", "b/p/1.jpg", "b/p/4.jpg"]);
    expect(paths(moveSlide(m(4), 3, 0))).toEqual(["b/p/4.jpg", "b/p/1.jpg", "b/p/2.jpg", "b/p/3.jpg"]);
  });
  it("clamps the target and ignores an unknown slide", () => {
    expect(paths(moveSlide(m(3), 1, 9))).toEqual(["b/p/1.jpg", "b/p/3.jpg", "b/p/2.jpg"]);
    expect(paths(moveSlide(m(3), 0, -1))).toEqual(["b/p/1.jpg", "b/p/2.jpg", "b/p/3.jpg"]);
    expect(paths(moveSlide(m(3), 5, 0))).toEqual(["b/p/1.jpg", "b/p/2.jpg", "b/p/3.jpg"]);
  });
  it("does not change the input", () => {
    const input = m(3);
    moveSlide(input, 0, 2);
    expect(paths(input)).toEqual(["b/p/1.jpg", "b/p/2.jpg", "b/p/3.jpg"]);
  });
});

describe("removeSlide", () => {
  it("removes the slide at the index", () => {
    expect(paths(removeSlide(m(3), 1))).toEqual(["b/p/1.jpg", "b/p/3.jpg"]);
  });
  it("refuses to drop the last slide", () => {
    expect(removeSlide(m(1), 0)).toBeNull();
  });
  it("ignores an unknown index", () => {
    expect(paths(removeSlide(m(2), 4))).toEqual(["b/p/1.jpg", "b/p/2.jpg"]);
  });
});

describe("addProduct", () => {
  it("appends a product photo from the brand's assets", () => {
    expect(addProduct(m(2), "brand/products/oil.jpg")?.at(-1)).toEqual({ storage_path: "brand/products/oil.jpg", bucket: "brand-assets" });
    expect(addProduct(m(2), "brand/products/oil.jpg")).toHaveLength(3);
  });
  it("allows the tenth slide and refuses an 11th", () => {
    expect(addProduct(m(9), "x.jpg")).toHaveLength(MAX_SLIDES);
    expect(addProduct(m(10), "x.jpg")).toBeNull();
  });
  it("refuses an empty path", () => {
    expect(addProduct(m(1), "")).toBeNull();
  });
});

describe("cleanMedia", () => {
  it("keeps only the known fields", () => {
    expect(cleanMedia([{ storage_path: "a/b/c.jpg", bucket: null, width: 1080, height: 1350, extra: 1 }]))
      .toEqual([{ storage_path: "a/b/c.jpg", bucket: null, width: 1080, height: 1350 }]);
    expect(cleanMedia([{ storage_path: "a.jpg", bucket: "brand-assets" }])).toEqual([{ storage_path: "a.jpg", bucket: "brand-assets" }]);
  });
  it("refuses empty, too many, or malformed slides", () => {
    expect(cleanMedia([])).toBeNull();
    expect(cleanMedia(m(11))).toBeNull();
    expect(cleanMedia("nope")).toBeNull();
    expect(cleanMedia([{ storage_path: 3 }])).toBeNull();
    expect(cleanMedia([{ storage_path: "a.jpg", bucket: "other" }])).toBeNull();
    expect(cleanMedia([{ storage_path: "a.jpg", width: -2 }])).toBeNull();
  });
});

describe("redoFeedback", () => {
  it("is empty with nothing typed or picked", () => {
    expect(redoFeedback("", [])).toBe("");
    expect(redoFeedback("   ", [])).toBe("");
  });
  it("uses a quick pick alone", () => {
    expect(redoFeedback("", ["More playful"])).toBe("More playful");
  });
  it("uses typed text alone, trimmed", () => {
    expect(redoFeedback("  use the rose oil photo ", [])).toBe("use the rose oil photo");
  });
  it("joins picks and typed text with '. ', picks first", () => {
    expect(redoFeedback("use the rose oil photo", ["Shorter caption", "More playful"]))
      .toBe("Shorter caption. More playful. use the rose oil photo");
  });
  it("doesn't double the full stop or repeat a pick", () => {
    expect(redoFeedback("Use the rose oil photo.", ["Different photos", "Different photos"]))
      .toBe("Different photos. Use the rose oil photo.");
    expect(redoFeedback("more warmth.", ["More professional"])).toBe("More professional. more warmth.");
  });
});
