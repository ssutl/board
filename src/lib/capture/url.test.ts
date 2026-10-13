import { describe, expect, it } from "vitest";
import { firstUrl, isBlockedSource, isSafeFetchUrl, parseMeta, sniffImageType } from "./url";

describe("firstUrl", () => {
  it("finds the first http(s) URL in shared text", () => {
    expect(firstUrl("look at this https://example.com/a?b=1 so good")).toBe("https://example.com/a?b=1");
    expect(firstUrl("(https://example.com/x).")).toBe("https://example.com/x");
    expect(firstUrl("no link here")).toBeNull();
    expect(firstUrl("ftp://example.com")).toBeNull();
  });
});

describe("isBlockedSource", () => {
  it("flags apps that block fetching", () => {
    for (const u of ["https://www.instagram.com/p/abc/", "https://instagram.com/p/abc", "https://pin.it/xyz", "https://www.pinterest.co.uk/pin/1/", "https://x.com/a/status/1", "https://twitter.com/a", "https://www.tiktok.com/@a/video/1"])
      expect(isBlockedSource(u), u).toBe(true);
    expect(isBlockedSource("https://notinstagram.com/")).toBe(false);
    expect(isBlockedSource("https://www.porsche.com/")).toBe(false);
  });
});

describe("isSafeFetchUrl", () => {
  it("allows public http(s)", () => {
    expect(isSafeFetchUrl("https://example.com/a")).toBe(true);
    expect(isSafeFetchUrl("http://8.8.8.8/")).toBe(true);
  });
  it("refuses other schemes, localhost, private and link-local addresses, credentials", () => {
    for (const u of ["file:///etc/passwd", "javascript:alert(1)", "http://localhost:3000", "http://app.localhost", "http://127.0.0.1", "http://2130706433/", "http://10.0.0.1", "http://172.16.5.4", "http://192.168.1.1", "http://169.254.169.254/latest", "http://[::1]/", "http://[fd00::1]/", "http://user:pw@example.com", "not a url"])
      expect(isSafeFetchUrl(u), u).toBe(false);
  });
});

describe("parseMeta", () => {
  it("reads og:image and og:title, resolving relative URLs against the page", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Porsche 911 &amp; friends">
      <meta content='/img/hero.jpg' property='og:image'></head></html>`;
    expect(parseMeta(html, "https://shop.example.com/p/1")).toEqual({ image: "https://shop.example.com/img/hero.jpg", title: "Porsche 911 & friends" });
  });
  it("falls back to twitter:image and <title>", () => {
    const html = `<title>  A   Jacket </title><meta name="twitter:image" content="https://cdn.example.com/j.png">`;
    expect(parseMeta(html, "https://example.com")).toEqual({ image: "https://cdn.example.com/j.png", title: "A Jacket" });
  });
  it("returns nulls when there is nothing", () => {
    expect(parseMeta("<p>hi</p>", "https://example.com")).toEqual({ image: null, title: null });
  });
  it("ignores non-http images", () => {
    expect(parseMeta(`<meta property="og:image" content="data:image/png;base64,AAAA">`, "https://example.com").image).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("recognises by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))?.mime).toBe("image/gif");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.4"))).toBeNull();
  });
});
