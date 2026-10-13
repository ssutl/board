import sharp, { type Sharp } from "sharp";
import { MAX_IMAGE_PX, MIN_CROP_AREA } from "@/lib/config";

/** Gemini's box convention: [ymin, xmin, ymax, xmax], each 0–1000 of the image's height/width. */
export type Box = [number, number, number, number];
export type Rect = { left: number; top: number; width: number; height: number };
export type Rendered = { bytes: Buffer; width: number; height: number };

const clamp = (n: number) => Math.min(1000, Math.max(0, n));

/** Pixel rectangle for a box, or null when the crop is missing, nonsense, tiny (< 20%) or the whole image. */
export function cropRect(box: Box | null, width: number, height: number): Rect | null {
  if (!box) return null;
  const [y0, x0, y1, x1] = box.map(clamp);
  if (y1 <= y0 || x1 <= x0) return null;
  const left = Math.round((x0 / 1000) * width);
  const top = Math.round((y0 / 1000) * height);
  const rect = { left, top, width: Math.round((x1 / 1000) * width) - left, height: Math.round((y1 / 1000) * height) - top };
  if (rect.width < 1 || rect.height < 1) return null;
  if ((rect.width * rect.height) / (width * height) < MIN_CROP_AREA) return null;
  if (rect.width === width && rect.height === height) return null;
  return rect;
}

/** Upright JPEG (EXIF rotation applied) so Gemini's box and sharp's pixels agree. */
export async function normalizeImage(input: Uint8Array): Promise<Rendered> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

const FIT = { width: MAX_IMAGE_PX, height: MAX_IMAGE_PX, fit: "inside", withoutEnlargement: true } as const;

async function render(image: Sharp): Promise<Rendered> {
  const { data, info } = await image.resize(FIT).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** The image shown publicly (cropped when there is a crop) and the uncropped one kept alongside. */
export async function renderVariants(normal: Buffer, rect: Rect | null): Promise<{ shown: Rendered; uncropped: Rendered }> {
  const uncropped = await render(sharp(normal));
  const shown = rect ? await render(sharp(normal).extract(rect)) : uncropped;
  return { shown, uncropped };
}
