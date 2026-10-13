import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { db } from "@/lib/db/client";
import { useTestDb } from "@/lib/db/testing";

vi.mock("@/lib/storage", () => ({
  putImage: vi.fn(async (path: string) => `https://blob.test/${path}`),
  deleteFiles: vi.fn(),
  download: vi.fn(),
}));
const storage = await import("@/lib/storage");
const { handleDrop } = await import("./drop");

useTestDb();

let png: Uint8Array<ArrayBuffer>;
beforeEach(async () => {
  png = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#0a0" } }).png().toBuffer());
  vi.mocked(storage.putImage).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const form = (entries: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};
const file = (bytes: Uint8Array<ArrayBuffer>, name = "shot.png", type = "image/png") => new File([bytes], name, { type });
const items = () => db().query<{ kind: string; status: string; source_url: string | null; title: string | null; blocked_source: boolean }>("select kind, status, source_url, title, blocked_source from items");

describe("handleDrop", () => {
  it("stores a new image and asks for processing", async () => {
    const res = await handleDrop(form({ file: file(png) }));
    expect(res.status).toBe(201);
    expect(res.processId).toBe(res.body.id);
    expect(vi.mocked(storage.putImage).mock.calls[0][0]).toMatch(/^originals\/[0-9a-f]{64}\.png$/);
  });

  it("returns the existing item for a duplicate", async () => {
    const first = await handleDrop(form({ file: file(png) }));
    const again = await handleDrop(form({ input: file(png, "x.bin", "application/octet-stream") }));
    expect(again).toEqual({ status: 200, body: { id: first.body.id, kind: "image", duplicate: true } });
  });

  it("concurrent duplicate drops make one item", async () => {
    const [a, b] = await Promise.all([handleDrop(form({ file: file(png) })), handleDrop(form({ file: file(png) }))]);
    expect(a.body.id).toBe(b.body.id);
    expect(await items()).toHaveLength(1);
  });

  it("rejects non-images and oversize files", async () => {
    expect((await handleDrop(form({ file: file(new TextEncoder().encode("%PDF-1.4"), "a.pdf", "application/pdf") }))).status).toBe(415);
    expect((await handleDrop(form({ file: file(new Uint8Array(MAX_UPLOAD_BYTES + 1)) }))).status).toBe(413);
  });

  it("rejects nothing useful", async () => {
    expect((await handleDrop(form({}))).status).toBe(400);
    expect((await handleDrop(form({ input: "just words" }))).status).toBe(400);
    expect((await handleDrop(form({ url: "http://192.168.1.1/x" }))).status).toBe(400);
  });

  it("saves Instagram links as blocked link cards without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleDrop(form({ input: "so good https://www.instagram.com/p/abc/" }));
    expect(res.body).toMatchObject({ kind: "link", blocked: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await items())[0]).toMatchObject({ kind: "link", status: "ready", blocked_source: true });
  });

  it("follows og:image (relative) and keeps the page as the source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "https://shop.example.com/p/1"
          ? new Response(`<title>Jacket</title><meta property="og:image" content="/img/j.png">`, { headers: { "content-type": "text/html" } })
          : new Response(png, { headers: { "content-type": "image/png" } }),
      ),
    );
    const res = await handleDrop(form({ url: "https://shop.example.com/p/1" }));
    expect(res.status).toBe(201);
    expect((await items())[0]).toMatchObject({ kind: "image", source_url: "https://shop.example.com/p/1", title: "Jacket" });
  });

  it("accepts a direct image link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } })));
    expect((await handleDrop(form({ url: "https://cdn.example.com/a.png" }))).body.kind).toBe("image");
  });

  it("falls back to a link card when there is no share image or the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Plain</title>", { headers: { "content-type": "text/html" } })));
    expect((await handleDrop(form({ url: "https://example.com/a" }))).body.kind).toBe("link");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await handleDrop(form({ url: "https://example.com/b" }))).body.kind).toBe("link");
    expect((await items()).map((i) => i.title).sort()).toEqual(["Plain", null].sort());
  });
});
