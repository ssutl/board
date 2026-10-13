/** The first http(s) URL in shared text, minus trailing punctuation. */
export function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;:!?]+$/, "") : null;
}

const BLOCKED = ["instagram.com", "pin.it", "x.com", "twitter.com", "tiktok.com", "threads.net"];

/** Apps that hide content from servers: save a link card and ask for a screenshot instead. */
export function isBlockedSource(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host)) return true;
  return BLOCKED.some((d) => host === d || host.endsWith(`.${d}`));
}

/** http(s) to a public host only: no localhost, private, link-local or credentialed URLs. */
export function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127))
      return false;
  }
  if (host.includes(":") && (host === "::1" || host === "::" || /^f[cd]/.test(host) || host.startsWith("fe80") || host.startsWith("::ffff:"))) return false;
  return true;
}

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">" };
const decode = (s: string) =>
  s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (_, e: string) => ENTITIES[e]).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

/** The page's share image (og/twitter) and title, with the image resolved against the page URL. */
export function parseMeta(html: string, baseUrl: string): { image: string | null; title: string | null } {
  const head = html.slice(0, 500_000);
  const metas: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(ATTR)) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !(key in metas)) metas[key] = attrs.content;
  }
  const raw = metas["og:image:secure_url"] ?? metas["og:image"] ?? metas["og:image:url"] ?? metas["twitter:image"] ?? metas["twitter:image:src"];
  let image: string | null = null;
  if (raw) {
    try {
      const u = new URL(raw.trim(), baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") image = u.toString();
    } catch {
      image = null;
    }
  }
  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = (metas["og:title"] ?? (titleTag ? decode(titleTag) : "")).trim().replace(/\s+/g, " ").slice(0, 200) || null;
  return { image, title };
}

type ImageType = { mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; ext: string };

/** The real type from the first bytes; uploads' declared types are not trusted. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}
