export const SESSION_COOKIE = "board_session";
export const SESSION_DAYS = 90;

const encoder = new TextEncoder();

export function sessionSecret(): string {
  const secret = process.env.BOARD_SECRET;
  if (!secret || secret.length < 32) throw new Error("BOARD_SECRET must be set to at least 32 characters.");
  return secret;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** "<expires-ms>.<signature>": says the holder is logged in until then; cannot be forged without the secret. */
export async function createSession(secret: string, now = Date.now()): Promise<string> {
  const expires = String(now + SESSION_DAYS * 86_400_000);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(expires));
  return `${expires}.${toBase64Url(signature)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expires, signature, extra] = token.split(".");
  if (extra !== undefined || !expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(signature), encoder.encode(expires));
  } catch {
    return false;
  }
}

/**
 * Where the sign-in form may send the browser once the cookie is set. The form carries the
 * path it is standing on, and that comes from the page, so it is treated as untrusted: only
 * ever a same-origin path on the edit side, and "/edit" for anything else.
 *
 * A single leading "/", no backslash (browsers can treat `/\host` as protocol-relative) and
 * no ASCII control characters; then resolved against a fixed base, which both confirms the
 * origin and flattens any "..", so "/edit/../room" is seen for the "/room" it really is.
 */
export function safeEditPath(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(next)) return "/edit";
  try {
    const url = new URL(next, "http://x");
    if (url.origin !== "http://x") return "/edit";
    return url.pathname === "/edit" || url.pathname.startsWith("/edit/") ? url.pathname + url.search : "/edit";
  } catch {
    return "/edit";
  }
}

/** Compares HMACs of both strings so the time taken does not depend on how much matches. */
export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const key = await hmacKey("board-password-compare");
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.sign("HMAC", key, encoder.encode(s))));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
