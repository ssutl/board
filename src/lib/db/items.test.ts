import { describe, expect, it } from "vitest";
import { db } from "./client";
import { axis, insertTestItem, useTestDb } from "./testing";
import { claimableIds, claimItem, deleteItem, insertImageItem, insertLinkItem, looseItems, markFailed, releaseClaim, resetForReprocess } from "./items";

useTestDb();

const setRow = (id: string, sql: string) => db().query(`update items set ${sql} where id = $1`, [id]);

describe("items", () => {
  it("concurrent duplicate drops make one item", async () => {
    const [a, b] = await Promise.all([
      insertImageItem({ contentHash: "h1", originalUrl: "https://blob/1" }),
      insertImageItem({ contentHash: "h1", originalUrl: "https://blob/1" }),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await db().query("select id from items")).toHaveLength(1);
  });

  it("claims a pending item exactly once", async () => {
    const { id } = await insertImageItem({ contentHash: "h2", originalUrl: "https://blob/2" });
    expect((await claimItem(id))?.status).toBe("processing");
    expect(await claimItem(id)).toBeNull();
  });

  it("retries failed items until 3 attempts", async () => {
    const { id } = await insertImageItem({ contentHash: "h3", originalUrl: "https://blob/3" });
    await claimItem(id);
    await markFailed(id, "boom");
    expect(await claimableIds(10)).toEqual([id]);
    await setRow(id, "attempts = 3");
    expect(await claimableIds(10)).toEqual([]);
    expect(await claimItem(id)).toBeNull();
  });

  it("stale processing claim is reclaimed after 10 minutes, a fresh one is not", async () => {
    const { id } = await insertImageItem({ contentHash: "h4", originalUrl: "https://blob/4" });
    await claimItem(id);
    expect(await claimItem(id)).toBeNull();
    await setRow(id, "claimed_at = now() - interval '11 minutes'");
    expect(await claimItem(id)).not.toBeNull();
  });

  it("releasing a claim does not use an attempt", async () => {
    const { id } = await insertImageItem({ contentHash: "h5", originalUrl: "https://blob/5" });
    await claimItem(id);
    await releaseClaim(id);
    const [row] = await db().query<{ status: string; attempts: number }>("select status, attempts from items where id = $1", [id]);
    expect(row).toEqual({ status: "pending", attempts: 0 });
  });

  it("never claims link items", async () => {
    const id = await insertLinkItem({ sourceUrl: "https://instagram.com/p/x", title: null, blocked: true });
    expect(await claimItem(id)).toBeNull();
  });

  it("loose = ready images with no non-excluded membership", async () => {
    const onBoard = await insertTestItem({ embedding: axis(0) });
    const excludedOnly = await insertTestItem({ embedding: axis(1) });
    const loose = await insertTestItem({ embedding: axis(2) });
    await insertTestItem({ embedding: axis(3), status: "pending" });
    const [board] = await db().query<{ id: string }>("insert into boards (slug, name, centroid) values ('b', 'B', $1::vector) returning id", [`[${axis(0).join(",")}]`]);
    await db().query("insert into board_items (board_id, item_id) values ($1, $2)", [board.id, onBoard]);
    await db().query("insert into board_items (board_id, item_id, excluded) values ($1, $2, true)", [board.id, excludedOnly]);
    expect((await looseItems()).map((l) => l.id).sort()).toEqual([excludedOnly, loose].sort());
  });

  it("deleteItem returns its files and boards; resetForReprocess re-queues", async () => {
    const id = await insertTestItem({ embedding: axis(0) });
    await setRow(id, "original_url = 'https://blob/o', uncropped_url = 'https://blob/u'");
    await resetForReprocess(id, { useCrop: false });
    const [row] = await db().query<{ status: string; use_crop: boolean }>("select status, use_crop from items where id = $1", [id]);
    expect(row).toEqual({ status: "pending", use_crop: false });
    const gone = await deleteItem(id);
    expect(gone?.files.sort()).toEqual(["https://blob/o", "https://blob/u", "https://x.public.blob.vercel-storage.com/a.jpg"].sort());
    expect(await deleteItem(id)).toBeNull();
  });
});
