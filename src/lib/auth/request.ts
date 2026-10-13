import "server-only";
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
  return verifySession(cookie(req, SESSION_COOKIE), sessionSecret());
}

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && bearer(req) === secret;
}
