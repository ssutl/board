import { describe, expect, it } from "vitest";
import { createSession, passwordMatches, safeEditPath, SESSION_DAYS, verifySession } from "./session";

const secret = "s".repeat(40);
const day = 86_400_000;

describe("session", () => {
  it("accepts a token it made", async () => {
    expect(await verifySession(await createSession(secret), secret)).toBe(true);
  });

  it("rejects a token signed with another secret", async () => {
    expect(await verifySession(await createSession("x".repeat(40)), secret)).toBe(false);
  });

  it("rejects a tampered expiry or signature", async () => {
    const token = await createSession(secret);
    const [expires, signature] = token.split(".");
    expect(await verifySession(`${Number(expires) + day}.${signature}`, secret)).toBe(false);
    expect(await verifySession(`${expires}.${signature.slice(0, -2)}AA`, secret)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const token = await createSession(secret, now);
    expect(await verifySession(token, secret, now + SESSION_DAYS * day + 1)).toBe(false);
  });

  it("rejects missing and malformed tokens", async () => {
    for (const bad of [undefined, "", "abc", "123.", ".sig", "12x.sig", "123.!!!"]) expect(await verifySession(bad, secret)).toBe(false);
  });

  it("compares passwords", async () => {
    expect(await passwordMatches("open sesame", "open sesame")).toBe(true);
    expect(await passwordMatches("open sesam", "open sesame")).toBe(false);
  });

  it("keeps the edit path the form came from", () => {
    expect(safeEditPath("/edit")).toBe("/edit");
    expect(safeEditPath("/edit/books")).toBe("/edit/books");
    expect(safeEditPath("/edit/themes/")).toBe("/edit/themes/");
    expect(safeEditPath("/edit/duplicates?book=3")).toBe("/edit/duplicates?book=3");
    // Percent-encoded text is inert to the URL parser (it only strips raw ASCII
    // tab/CR/LF bytes, not the literal characters "%", "0", "d"), so this resolves
    // to a same-origin edit path and is not a header-injection vector; it is kept.
    expect(safeEditPath("/edit/%0d%0aevil")).toBe("/edit/%0d%0aevil");
  });

  it("falls back to /edit for anything off the edit side or off the origin", () => {
    const bad = [
      "//evil.com",
      "/\\evil.com",
      "\\evil.com",
      "https://evil.com",
      "",
      "/",
      "/edits",
      "/h/abc",
      "/edit/../room",
      "/edit\x00/x",
      "/edit@evil.com", // a whole path segment, not the edit side: the URL parser reads no userinfo in a path
      "/editor",
      "/edit/%2e%2e/room", // "%2e%2e" is decoded before the ".." is flattened, so this leaves /edit too
      "//evil.com/edit",
      " /edit", // a leading space: no longer path-only
    ];
    for (const next of bad) expect(safeEditPath(next)).toBe("/edit");
  });
});
