import { isSafeFetchUrl } from "./url";

export class FetchError extends Error {}

const USER_AGENT = "Mozilla/5.0 (compatible; BoardBot/1.0; +https://board.ssutl.com)";

/**
 * GET with a timeout, a byte cap (enforced while streaming, not just by content-length), an
 * allowed content type, and redirects followed by hand so every hop is checked by isSafeFetchUrl.
 */
export async function fetchLimited(
  url: string,
  { maxBytes, accept, timeoutMs = 8_000, maxRedirects = 3 }: { maxBytes: number; accept: (contentType: string) => boolean; timeoutMs?: number; maxRedirects?: number },
): Promise<{ bytes: Uint8Array; contentType: string; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafeFetchUrl(current)) throw new FetchError(`Refusing to fetch ${current}`);
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": USER_AGENT, accept: "*/*" } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new FetchError("Redirect without a location.");
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) throw new FetchError(`HTTP ${res.status}`);
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!accept(contentType)) throw new FetchError(`Unexpected content type ${contentType || "(none)"}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new FetchError("Too large.");
    return { bytes: await readCapped(res, maxBytes), contentType, finalUrl: current };
  }
  throw new FetchError("Too many redirects.");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new FetchError("Too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
