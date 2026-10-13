"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, passwordMatches, safeEditPath, SESSION_COOKIE, SESSION_DAYS, sessionSecret } from "@/lib/auth/session";

/**
 * The one door: the edit layout shows this form to a browser without a session, and a right
 * password sets the cookie and sends it back to the page it asked for. Nothing else signs in.
 */
export async function signIn(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const expected = process.env.BOARD_PASSWORD;
  if (!expected) return { error: "BOARD_PASSWORD is not set on the server." };
  if (!(await passwordMatches(String(form.get("password") ?? ""), expected))) return { error: "Wrong password." };

  (await cookies()).set(SESSION_COOKIE, await createSession(sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(safeEditPath(String(form.get("next") ?? "/edit")));
}
