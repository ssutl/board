import "server-only";
import { del, put } from "@vercel/blob";

/** Public Blob file at a fixed path (re-uploading the same path replaces it). */
export async function putImage(pathname: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const blob = await put(pathname, Buffer.from(bytes), { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true });
  return blob.url;
}

export async function deleteFiles(urls: string[]): Promise<void> {
  if (urls.length) await del(urls);
}

export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
