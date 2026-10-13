import { describe, expect, it } from "vitest";
import { createBoard } from "./boards";
import { db } from "./client";
import { insertLinkItem } from "./items";
import { openSuggestion } from "./suggestions";
import { axis, insertTestItem, useTestDb } from "./testing";
import { boardForEdit, editBadges, itemForEdit, listInbox, listLooseForEdit } from "./edit";

useTestDb();

describe("edit queries", () => {
  it("counts what needs attention", async () => {
    await insertTestItem({ status: "pending" });
    await insertTestItem({ status: "failed" });
    const onBoard = await insertTestItem({ embedding: axis(0) });
    await insertTestItem({ embedding: axis(1) }); // loose
    await insertLinkItem({ sourceUrl: "https://instagram.com/p/x", title: null, blocked: true }); // loose link
    await createBoard({ name: "B", description: "", centroid: axis(0), coverItemId: onBoard, members: [{ itemId: onBoard, similarity: 1 }] });
    await openSuggestion({ type: "merge", payload: { keepId: "a", dropId: "b", similarity: 0.95 } }, "fp");
    expect(await editBadges()).toEqual({ inbox: 2, loose: 2, suggestions: 1 });
    expect((await listInbox()).map((r) => r.status).sort()).toEqual(["failed", "pending"]);
    const loose = await listLooseForEdit();
    expect([loose.images.length, loose.links.length]).toEqual([1, 1]);
  });

  it("flags processing items whose claim has gone stale", async () => {
    const fresh = await insertTestItem({ status: "pending" });
    const stuck = await insertTestItem({ status: "pending" });
    await db().query("update items set status = 'processing', claimed_at = now() where id = $1", [fresh]);
    await db().query("update items set status = 'processing', claimed_at = now() - interval '11 minutes' where id = $1", [stuck]);
    const flags = Object.fromEntries((await listInbox()).map((r) => [r.id, r.stale]));
    expect(flags).toEqual({ [fresh]: false, [stuck]: true });
    expect((await itemForEdit(fresh))?.item.stale).toBe(false);
    expect((await itemForEdit(stuck))?.item.stale).toBe(true);
  });

  it("reads a board and an item with their relationships", async () => {
    const a = await insertTestItem({ embedding: axis(0) });
    const board = await createBoard({ name: "B", description: "", centroid: axis(0), coverItemId: a, members: [{ itemId: a, similarity: 1 }] });
    expect((await boardForEdit(board.id))?.items.map((i) => i.id)).toEqual([a]);
    expect((await itemForEdit(a))?.boards).toEqual([{ id: board.id, slug: "b", name: "B", pinned: false, excluded: false }]);
    expect(await itemForEdit("nope")).toBeNull();
  });
});
