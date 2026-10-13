import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { config, proxy } from "./proxy";

const SECRET = "y".repeat(40);
beforeEach(() => vi.stubEnv("BOARD_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  it("only guards the edit side", () => {
    expect(config.matcher).toEqual(["/edit", "/edit/:path*"]);
  });

  it("lets a browser navigation through so the page can show the password box", async () => {
    expect(passes(await proxy(new NextRequest("https://board.ssutl.com/edit", { headers: { "sec-fetch-dest": "document" } })))).toBe(true);
  });

  it("401s a signed-out fetch of edit data", async () => {
    const res = await proxy(new NextRequest("https://board.ssutl.com/edit/loose", { headers: { "sec-fetch-dest": "empty" } }));
    expect(res.status).toBe(401);
  });

  it("lets a signed-in fetch through", async () => {
    const token = await createSession(SECRET);
    const res = await proxy(new NextRequest("https://board.ssutl.com/edit/loose", { headers: { "sec-fetch-dest": "empty", cookie: `${SESSION_COOKIE}=${token}` } }));
    expect(passes(res)).toBe(true);
  });
});
