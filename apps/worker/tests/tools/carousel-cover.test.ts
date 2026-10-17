import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brandLogoBand } from "../../src/tools/carousel-cover.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const brandDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-logo-"));

describe("brandLogoBand (agent-controlled brandLogoPath)", () => {
  it("rejects files outside the brand and tmp roots", async () => {
    await expect(brandLogoBand("/etc/passwd", brandDir)).rejects.toThrow(/outside the brand and render directories/);
    await expect(brandLogoBand("../../../../etc/passwd", brandDir)).rejects.toThrow(/outside|not found/);
  });

  it("embeds an allowed image as a data URL inside the band", async () => {
    fs.writeFileSync(path.join(brandDir, "logo.png"), PNG);
    const html = await brandLogoBand("logo.png", brandDir);
    expect(html).toContain('<div class="brand-logo-band">');
    expect(html).toContain(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("renders nothing without a path", async () => {
    expect(await brandLogoBand(null, brandDir)).toBe("");
  });
});
