import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionSecret, verifySession } from "./session";

/**
 * Checks the session cookie inside a server action, route handler or server component.
 * Every page under /edit checks hasSession() and every server action calls requireSession()
 * before reading or writing anything; the edit layout and src/proxy.ts are only the door.
 */
export async function hasSession(): Promise<boolean> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
}

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new Error("Not logged in.");
}
