import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "./session";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));

const { hasSession, requireSession } = await import("./requireSession");
const SECRET = "s".repeat(32);

describe("requireSession", () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv("BOARD_SECRET", SECRET);
  });

  it("throws without a session cookie", async () => {
    await expect(requireSession()).rejects.toThrow("Not logged in.");
    expect(await hasSession()).toBe(false);
  });

  it("throws for a forged or expired cookie", async () => {
    jar.set(SESSION_COOKIE, await createSession("x".repeat(32)));
    await expect(requireSession()).rejects.toThrow("Not logged in.");
    jar.set(SESSION_COOKIE, await createSession(SECRET, Date.now() - 365 * 86_400_000));
    await expect(requireSession()).rejects.toThrow("Not logged in.");
  });

  it("passes with a valid session cookie", async () => {
    jar.set(SESSION_COOKIE, await createSession(SECRET));
    await expect(requireSession()).resolves.toBeUndefined();
    expect(await hasSession()).toBe(true);
  });
});
