import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { brandImage } from "../../src/tools/brand-image.js";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

// Create a test brand directory with a small logo
let testBrandDir: string;
let testLogoPath: string;

beforeAll(async () => {
  testBrandDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-img-test-"));
  fs.mkdirSync(path.join(testBrandDir, "assets"), { recursive: true });

  // Create a 100x100 red PNG as test logo
  const logoBuf = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  testLogoPath = path.join(testBrandDir, "assets", "logo.png");
  fs.writeFileSync(testLogoPath, logoBuf);
});

afterAll(() => {
  fs.rmSync(testBrandDir, { recursive: true });
});

const baseBranding = {
  enabled: true,
  logoPath: "assets/logo.png",
  showLogo: true,
  showHandle: true,
  showPageIndicator: true,
  showSwipeArrow: true,
};

describe("brandImage", () => {
  it("creates a 1080x1350 image from a text card", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "Hello World",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: null,
      totalPages: null,
      backgroundColor: "#1a1a2e",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    fs.unlinkSync(result);
  });

  it("adds page indicator when pageNumber is set", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "Slide 2",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: 2,
      totalPages: 5,
      backgroundColor: "#2a2a3e",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);

    fs.unlinkSync(result);
  });

  it("skips logo when showLogo is false", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: "No logo",
      textPosition: "center",
      isThumbnail: false,
      pageNumber: null,
      totalPages: null,
      backgroundColor: "#333333",
      branding: { ...baseBranding, showLogo: false },
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    fs.unlinkSync(result);
  });

  it("brands an image from a local file path", async () => {
    // Create a test source image
    const srcPath = path.join(testBrandDir, "source.png");
    await sharp({
      create: { width: 800, height: 1000, channels: 3, background: { r: 100, g: 100, b: 200 } },
    })
      .png()
      .toFile(srcPath);

    const result = await brandImage({
      imageSource: srcPath,
      textOverlay: "Branded!",
      textPosition: "top",
      isThumbnail: true,
      pageNumber: 1,
      totalPages: 3,
      backgroundColor: null,
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    fs.unlinkSync(result);
    fs.unlinkSync(srcPath);
  });

  it("creates image without any text overlay", async () => {
    const result = await brandImage({
      imageSource: null,
      textOverlay: null,
      textPosition: "center",
      isThumbnail: false,
      pageNumber: 1,
      totalPages: 1,
      backgroundColor: "#000000",
      branding: baseBranding,
      brandDir: testBrandDir,
      instagramHandle: "testbrand",
    });

    expect(fs.existsSync(result)).toBe(true);
    fs.unlinkSync(result);
  });
});

import { brandCarousel } from "../../src/tools/brand-image.js";

describe("brandCarousel", () => {
  it("brands multiple slides with auto page numbering", async () => {
    const paths = await brandCarousel(
      [
        { imageSource: null, textOverlay: "Slide 1", textPosition: "center", isThumbnail: true, backgroundColor: "#111111" },
        { imageSource: null, textOverlay: "Slide 2", textPosition: "center", isThumbnail: false, backgroundColor: "#222222" },
        { imageSource: null, textOverlay: "Slide 3", textPosition: "center", isThumbnail: false, backgroundColor: "#333333" },
      ],
      baseBranding,
      testBrandDir,
      "testbrand"
    );

    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(fs.existsSync(p)).toBe(true);
      const meta = await sharp(p).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1350);
      fs.unlinkSync(p);
    }
  });

  it("single slide carousel has no page indicator", async () => {
    const paths = await brandCarousel(
      [{ imageSource: null, textOverlay: "Solo", textPosition: "center", isThumbnail: false, backgroundColor: "#000000" }],
      baseBranding,
      testBrandDir,
      "testbrand"
    );

    expect(paths).toHaveLength(1);
    expect(fs.existsSync(paths[0])).toBe(true);
    fs.unlinkSync(paths[0]);
  });
});
