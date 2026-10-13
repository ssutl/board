import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropRect, normalizeImage, renderVariants } from "./crop";

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#c33" } });

describe("cropRect", () => {
  it("converts a 0–1000 box to pixels", () => {
    expect(cropRect([100, 200, 600, 700], 1000, 2000)).toEqual({ left: 200, top: 200, width: 500, height: 1000 });
  });
  it("clamps boxes that spill outside the image", () => {
    expect(cropRect([-50, -50, 1200, 500], 1000, 1000)).toEqual({ left: 0, top: 0, width: 500, height: 1000 });
  });
  it("ignores no box, inverted boxes, tiny crops and no-op crops", () => {
    expect(cropRect(null, 100, 100)).toBeNull();
    expect(cropRect([600, 0, 100, 1000], 100, 100)).toBeNull();
    expect(cropRect([0, 0, 400, 400], 1000, 1000)).toBeNull(); // 16% of the image < 20%
    expect(cropRect([0, 0, 1000, 1000], 1000, 1000)).toBeNull();
  });
});

describe("normalizeImage", () => {
  it("applies EXIF rotation and outputs JPEG", async () => {
    const rotated = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await normalizeImage(rotated);
    expect([out.width, out.height]).toEqual([200, 400]);
    expect((await sharp(out.bytes).metadata()).format).toBe("jpeg");
  });
  it("accepts PNG", async () => {
    const out = await normalizeImage(await solid(50, 60).png().toBuffer());
    expect([out.width, out.height]).toEqual([50, 60]);
  });
  it("flattens transparency onto white", async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await normalizeImage(png);
    expect((await sharp(out.bytes).raw().toBuffer())[0]).toBeGreaterThan(250);
  });
});

describe("renderVariants", () => {
  it("crops the shown image and caps both at 2000px", async () => {
    const normal = await solid(4000, 3000).jpeg().toBuffer();
    const { shown, uncropped } = await renderVariants(normal, { left: 0, top: 0, width: 1000, height: 3000 });
    expect([uncropped.width, uncropped.height]).toEqual([2000, 1500]);
    expect([shown.width, shown.height]).toEqual([667, 2000]);
  });
  it("shows the uncropped image when there is no crop", async () => {
    const normal = await solid(300, 200).jpeg().toBuffer();
    const { shown, uncropped } = await renderVariants(normal, null);
    expect(shown).toBe(uncropped);
    expect([shown.width, shown.height]).toEqual([300, 200]);
  });
});
