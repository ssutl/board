import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { verifyDropKey } from "./dropKey";
import { SESSION_COOKIE, sessionSecret, verifySession } from "./session";

export function bearer(req: Request): string | null {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The Apple Shortcut's Bearer key, or the edit side's session cookie (desktop paste). */
export async function dropAuthorized(req: Request): Promise<boolean> {
  const token = bearer(req);
  if (token) return verifyDropKey(token);
  try {
    return await verifySession(cookie(req, SESSION_COOKIE), sessionSecret());
  } catch {
    return false; // malformed cookie, or BOARD_SECRET missing/short
  }
}

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const token = bearer(req);
  if (!secret || !token) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(token), digest(secret));
}
