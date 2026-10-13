import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { createBoard, addToBoard, removeFromBoard, setBoardHidden, boardsForPlacement } from "@/lib/db/boards";
import { insertImageItem, getItem } from "@/lib/db/items";
import { axis, insertTestItem, useTestDb } from "@/lib/db/testing";
import { BudgetExceeded } from "@/lib/db/usage";

vi.mock("@/lib/storage", () => ({
  putImage: vi.fn(async (path: string) => `https://blob.test/${path}`),
  deleteFiles: vi.fn(async () => {}),
  download: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gemini")>()),
  lookAt: vi.fn(),
  embedImage: vi.fn(),
  nameBoard: vi.fn(),
}));

const storage = await import("@/lib/storage");
const gemini = await import("@/lib/ai/gemini");
const { processItem } = await import("./process");

useTestDb();

const look = (box: [number, number, number, number] | null = null) => ({
  box,
  caption: "A red car",
  tags: { what: "car", colours: ["red"], palette: ["red" as const], materials: [], era: "1980s", mood: [] },
});

beforeEach(async () => {
  vi.mocked(storage.download).mockResolvedValue(await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#c33" } }).jpeg().toBuffer());
  vi.mocked(gemini.lookAt).mockResolvedValue(look());
  vi.mocked(gemini.embedImage).mockReset().mockResolvedValue(axis(0));
  vi.mocked(storage.deleteFiles).mockClear();
});

const newItem = async () => (await insertImageItem({ contentHash: crypto.randomUUID(), originalUrl: "https://blob.test/o.jpg" })).id;

describe("processItem", () => {
  it("crops, embeds, places on the matching board and marks ready", async () => {
    const member = await insertTestItem({ embedding: axis(0) });
    const board = await createBoard({ name: "Red", description: "", centroid: axis(0), coverItemId: member, members: [{ itemId: member, similarity: 1 }] });
    vi.mocked(gemini.lookAt).mockResolvedValue(look([0, 0, 1000, 500]));
    const id = await newItem();
    expect(await processItem(id)).toBe("ready");
    const item = await getItem(id);
    expect(item).toMatchObject({ status: "ready", caption: "A red car", width: 500, height: 800 });
    expect(item!.image_url).not.toBe(item!.uncropped_url);
    expect((await boardsForPlacement(id)).find((b) => b.id === board.id)?.member).toBe(true);
  });

  it("ignores the box when use_crop is off", async () => {
    vi.mocked(gemini.lookAt).mockResolvedValue(look([0, 0, 1000, 500]));
    const id = await newItem();
    await db().query("update items set use_crop = false where id = $1", [id]);
    await processItem(id);
    expect(await getItem(id)).toMatchObject({ width: 1000, height: 800 });
  });

  it("fails cleanly on a malformed Gemini reply, counting an attempt", async () => {
    vi.mocked(gemini.lookAt).mockRejectedValue(new SyntaxError("Unexpected token"));
    const id = await newItem();
    expect(await processItem(id)).toBe("failed");
    expect(await getItem(id)).toMatchObject({ status: "failed", attempts: 1, error: "Unexpected token" });
  });

  const rateLimited = () => Object.assign(new Error('{"error":{"code":429},"retryDelay":"20s"}'), { status: 429 });

  it("defers without using an attempt when the budget is spent or rate-limited", async () => {
    const sleep = vi.fn(async () => {});
    vi.mocked(gemini.embedImage).mockRejectedValue(new BudgetExceeded("pipeline"));
    const a = await newItem();
    expect(await processItem(a, { sleep })).toBe("deferred");
    expect(await getItem(a)).toMatchObject({ status: "pending", attempts: 0 });
    expect(sleep).not.toHaveBeenCalled();

    vi.mocked(gemini.embedImage).mockClear().mockRejectedValue(rateLimited());
    const b = await newItem();
    expect(await processItem(b, { sleep })).toBe("deferred");
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(gemini.embedImage).toHaveBeenCalledTimes(2);
    expect(await getItem(b)).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("waits out a rate limit once and retries the item", async () => {
    const sleep = vi.fn(async () => {});
    vi.mocked(gemini.embedImage).mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce(axis(0));
    const id = await newItem();
    expect(await processItem(id, { sleep })).toBe("ready");
    expect(sleep).toHaveBeenCalledWith(21_000);
    expect(await getItem(id)).toMatchObject({ status: "ready", attempts: 1 });
  });

  it("defers instead of waiting when the wait would run past the deadline", async () => {
    const sleep = vi.fn(async () => {});
    vi.mocked(gemini.embedImage).mockRejectedValueOnce(rateLimited());
    const id = await newItem();
    expect(await processItem(id, { sleep, until: Date.now() + 10_000 })).toBe("deferred");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("skips an item someone else is processing", async () => {
    const id = await newItem();
    await db().query("update items set status = 'processing', claimed_at = now() where id = $1", [id]);
    expect(await processItem(id)).toBe("skipped");
  });

  it("deletes the previous files when reprocessed", async () => {
    const id = await newItem();
    await db().query("update items set image_url = 'https://blob.test/old-shown.jpg', uncropped_url = 'https://blob.test/old-full.jpg' where id = $1", [id]);
    await processItem(id);
    expect(storage.deleteFiles).toHaveBeenCalledWith(["https://blob.test/old-shown.jpg", "https://blob.test/old-full.jpg"]);
  });

  it("never auto-places on hidden or excluded boards, and counts pinned boards toward the 3", async () => {
    const mk = async (name: string) => {
      const m = await insertTestItem({ embedding: axis(0) });
      return (await createBoard({ name, description: "", centroid: axis(0), coverItemId: m, members: [{ itemId: m, similarity: 1 }] })).id;
    };
    const [hidden, excluded, p1, p2, p3, open] = [await mk("H"), await mk("E"), await mk("P1"), await mk("P2"), await mk("P3"), await mk("O")];
    await setBoardHidden(hidden, true);
    const id = await newItem();
    await removeFromBoard(id, excluded);
    for (const b of [p1, p2, p3]) await addToBoard(id, b);
    await processItem(id);
    const flags = Object.fromEntries((await boardsForPlacement(id)).map((b) => [b.id, b.member]));
    expect(flags).toMatchObject({ [hidden]: false, [excluded]: false, [p1]: true, [p2]: true, [p3]: true, [open]: false });
  });
});
