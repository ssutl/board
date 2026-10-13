import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth/session";

/**
 * A browser opening the page, rather than the router fetching part of it. Next strips the RSC
 * flight headers before the proxy runs, so Sec-Fetch-Dest is all that's left: a shutter, not
 * the lock. The lock is hasSession() in every edit page and requireSession() in every action.
 */
function isDocumentRequest(req: NextRequest): boolean {
  const dest = req.headers.get("sec-fetch-dest");
  return (dest === null || dest === "document") && !req.nextUrl.pathname.endsWith(".rsc");
}

export async function proxy(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) return NextResponse.next();
  // Server actions (signing in is one) POST to the page path; each checks the session itself.
  if (req.method === "POST" && (req.headers.has("next-action") || req.headers.get("content-type")?.startsWith("multipart/form-data")))
    return NextResponse.next();
  return isDocumentRequest(req) ? NextResponse.next() : NextResponse.json({ error: "Not logged in." }, { status: 401 });
}

export const config = {
  // /api/drop and the cron routes check their own credentials. Must stay a literal: Next reads it statically.
  matcher: ["/edit", "/edit/:path*"],
};
