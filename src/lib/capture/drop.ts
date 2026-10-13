import "server-only";
import { createHash } from "node:crypto";
import { MAX_PAGE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/config";
import { findIdByHash, insertImageItem, insertLinkItem } from "@/lib/db/items";
import { putImage } from "@/lib/storage";
import { fetchLimited } from "./fetch";
import { firstUrl, isBlockedSource, isSafeFetchUrl, parseMeta, sniffImageType } from "./url";

export type DropBody = { id?: string; kind?: "image" | "link"; duplicate?: boolean; blocked?: boolean; error?: string };
export type DropResult = { status: number; body: DropBody; processId?: string };

/** Accepts `file`, `input` (the Shortcut's one field) or `url`: a File is an image, text is searched for a link. */
export async function handleDrop(form: FormData): Promise<DropResult> {
  const value = form.get("file") ?? form.get("input") ?? form.get("url");
  if (value instanceof File) {
    if (value.size > MAX_UPLOAD_BYTES) return { status: 413, body: { error: "That file is over 15 MB." } };
    return dropImage(new Uint8Array(await value.arrayBuffer()));
  }
  if (typeof value === "string") {
    const url = firstUrl(value);
    if (url) return dropUrl(url);
  }
  return { status: 400, body: { error: "Send an image or a link." } };
}

async function dropImage(bytes: Uint8Array, { sourceUrl = null, title = null }: { sourceUrl?: string | null; title?: string | null } = {}): Promise<DropResult> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { status: 413, body: { error: "That file is over 15 MB." } };
  const type = sniffImageType(bytes);
  if (!type) return { status: 415, body: { error: "Only JPEG, PNG, WebP or GIF images." } };
  const hash = createHash("sha256").update(bytes).digest("hex");
  const existing = await findIdByHash(hash);
  if (existing) return { status: 200, body: { id: existing, kind: "image", duplicate: true } };
  const originalUrl = await putImage(`originals/${hash}.${type.ext}`, bytes, type.mime);
  const { id, created } = await insertImageItem({ contentHash: hash, originalUrl, sourceUrl, title });
  return created ? { status: 201, body: { id, kind: "image" }, processId: id } : { status: 200, body: { id, kind: "image", duplicate: true } };
}

const isHtml = (t: string) => t === "text/html" || t === "application/xhtml+xml";
const isImage = (t: string) => t.startsWith("image/");

async function dropUrl(url: string): Promise<DropResult> {
  if (!isSafeFetchUrl(url)) return { status: 400, body: { error: "That link can't be fetched." } };
  if (isBlockedSource(url)) {
    const id = await insertLinkItem({ sourceUrl: url, title: null, blocked: true });
    return { status: 201, body: { id, kind: "link", blocked: true } };
  }
  let title: string | null = null;
  try {
    const page = await fetchLimited(url, { maxBytes: Math.max(MAX_PAGE_BYTES, MAX_UPLOAD_BYTES), accept: (t) => isHtml(t) || isImage(t) });
    if (isImage(page.contentType)) {
      const direct = await dropImage(page.bytes, { sourceUrl: url });
      if (direct.status < 400) return direct;
    } else {
      const meta = parseMeta(new TextDecoder().decode(page.bytes.subarray(0, MAX_PAGE_BYTES)), page.finalUrl);
      title = meta.title;
      if (meta.image) {
        const image = await fetchLimited(meta.image, { maxBytes: MAX_UPLOAD_BYTES, accept: isImage });
        const result = await dropImage(image.bytes, { sourceUrl: url, title });
        if (result.status < 400) return result;
      }
    }
  } catch (error) {
    console.warn(`drop: could not read ${url}`, error);
  }
  const id = await insertLinkItem({ sourceUrl: url, title, blocked: false });
  return { status: 201, body: { id, kind: "link" } };
}
