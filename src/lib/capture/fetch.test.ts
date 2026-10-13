import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLimited } from "./fetch";

const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const isHtml = (t: string) => t === "text/html";

afterEach(() => vi.unstubAllGlobals());

describe("fetchLimited", () => {
  it("returns the body and content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("<p>ok</p>")));
    const res = await fetchLimited("https://example.com", { maxBytes: 1000, accept: isHtml });
    expect(new TextDecoder().decode(res.bytes)).toBe("<p>ok</p>");
    expect(res.contentType).toBe("text/html");
  });

  it("follows a safe redirect and reports the final URL", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "https://a.example.com/" ? new Response(null, { status: 301, headers: { location: "/b" } }) : html("done"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchLimited("https://a.example.com/", { maxBytes: 1000, accept: isHtml });
    expect(res.finalUrl).toBe("https://a.example.com/b");
  });

  it("refuses a redirect to a private address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })));
    await expect(fetchLimited("https://example.com", { maxBytes: 1000, accept: isHtml })).rejects.toThrow(/Refusing/);
  });

  it("refuses bodies over the cap, even without content-length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("x".repeat(2000))));
    await expect(fetchLimited("https://example.com", { maxBytes: 1000, accept: isHtml })).rejects.toThrow(/Too large/);
  });

  it("refuses the wrong content type and HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })));
    await expect(fetchLimited("https://example.com", { maxBytes: 1000, accept: isHtml })).rejects.toThrow(/content type/);
    vi.stubGlobal("fetch", vi.fn(async () => html("nope", { status: 404 })));
    await expect(fetchLimited("https://example.com", { maxBytes: 1000, accept: isHtml })).rejects.toThrow(/HTTP 404/);
  });
});
