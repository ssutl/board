import { describe, expect, it } from "vitest";
import { dot } from "@/lib/vectors/math";
import { db } from "./client";
import { axis, insertTestItem, useTestDb } from "./testing";
import { fromVector } from "./vector";
import {
  addToBoard, boardMembers, boardsForPlacement, boardSummaries, createBoard, findBoard, mergeBoards, moveMembers,
  recomputeBoards, removeFromBoard, replaceAutoMemberships, setBoardHidden,
} from "./boards";
import { openSuggestion, listOpenSuggestions } from "./suggestions";

useTestDb();

async function boardWith(n: number, at = 0, name = "Analog 80s") {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await insertTestItem({ embedding: axis(at, { [at + 1]: i * 0.01 }) }));
  const board = await createBoard({ name, description: "d", centroid: axis(at), coverItemId: ids[0], members: ids.map((itemId) => ({ itemId, similarity: 0.9 })) });
  return { ...board, ids };
}

const boardRow = async (id: string) =>
  (await db().query<{ cover_item_id: string | null; centroid: string }>("select cover_item_id, centroid::text as centroid from boards where id = $1", [id]))[0];

describe("boards", () => {
  it("createBoard gives unique slugs", async () => {
    const a = await boardWith(2);
    const b = await boardWith(2, 4);
    expect([a.slug, b.slug]).toEqual(["analog-80s", "analog-80s-2"]);
  });

  it("replaceAutoMemberships keeps pinned and excluded rows", async () => {
    const a = await boardWith(1, 0, "A");
    const b = await boardWith(1, 4, "B");
    const c = await boardWith(1, 8, "C");
    const item = await insertTestItem({ embedding: axis(0) });
    await addToBoard(item, a.id); // pinned
    await removeFromBoard(item, b.id); // excluded
    await replaceAutoMemberships(item, [{ boardId: c.id, similarity: 0.8 }]);
    const flags = await boardsForPlacement(item);
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    expect(byId[a.id]).toMatchObject({ pinned: true, member: true });
    expect(byId[b.id]).toMatchObject({ excluded: true, member: false });
    expect(byId[c.id]).toMatchObject({ member: true, pinned: false });
    await replaceAutoMemberships(item, []);
    expect((await boardsForPlacement(item)).find((f) => f.id === c.id)?.member).toBe(false);
  });

  it("recomputes the centroid and reassigns a deleted cover", async () => {
    const board = await boardWith(3);
    await db().query("delete from items where id = $1", [board.ids[0]]);
    await recomputeBoards([board.id]);
    const row = await boardRow(board.id);
    expect(board.ids.slice(1)).toContain(row.cover_item_id);
    expect(dot(fromVector(row.centroid), axis(0))).toBeGreaterThan(0.99);
  });

  it("deletes a board left empty and rejects its open suggestions", async () => {
    const board = await boardWith(1);
    await openSuggestion({ type: "merge", payload: { keepId: board.id, dropId: "x", similarity: 0.95 } }, "fp1");
    expect(await findBoard(board.id)).toEqual({ id: board.id, hidden: false });
    await removeFromBoard(board.ids[0], board.id);
    expect(await boardRow(board.id)).toBeUndefined();
    expect(await findBoard(board.id)).toBeNull();
    expect(await listOpenSuggestions()).toEqual([]);
  });

  it("hiding a board rejects its open suggestions", async () => {
    const board = await boardWith(1);
    const other = await boardWith(1, 4, "Other");
    await openSuggestion({ type: "merge", payload: { keepId: other.id, dropId: board.id, similarity: 0.95 } }, "fp-merge");
    await openSuggestion({ type: "split", payload: { boardId: other.id, groups: [] } }, "fp-split");
    await setBoardHidden(board.id, true);
    expect((await listOpenSuggestions()).map((s) => s.type)).toEqual(["split"]);
    await setBoardHidden(board.id, false);
    expect(await listOpenSuggestions()).toHaveLength(1);
  });

  it("mergeBoards hides the kept board when the dropped one was hidden", async () => {
    const keep = await boardWith(1, 0, "Keep");
    const drop = await boardWith(1, 0, "Drop");
    await db().query("update boards set hidden = true where id = $1", [drop.id]);
    await mergeBoards(keep.id, drop.id);
    expect((await db().query<{ hidden: boolean }>("select hidden from boards where id = $1", [keep.id]))[0].hidden).toBe(true);
  });

  it("mergeBoards moves members, keeps pinned, respects exclusions, deletes the dropped board", async () => {
    const keep = await boardWith(2, 0, "Keep");
    const drop = await boardWith(2, 0, "Drop");
    await addToBoard(drop.ids[0], drop.id); // pinned on drop
    await removeFromBoard(drop.ids[1], keep.id); // excluded from keep
    await mergeBoards(keep.id, drop.id);
    const members = await boardMembers(keep.id);
    expect(members.map((m) => m.itemId).sort()).toEqual([...keep.ids, drop.ids[0]].sort());
    expect(members.find((m) => m.itemId === drop.ids[0])?.pinned).toBe(true);
    expect(await boardRow(drop.id)).toBeUndefined();
  });

  it("moveMembers moves only the given items", async () => {
    const from = await boardWith(3, 0, "From");
    const to = await boardWith(1, 4, "To");
    await moveMembers(from.id, to.id, [from.ids[2]]);
    expect((await boardMembers(to.id)).map((m) => m.itemId).sort()).toEqual([to.ids[0], from.ids[2]].sort());
    expect((await boardMembers(from.id)).map((m) => m.itemId)).not.toContain(from.ids[2]);
  });

  it("boardSummaries counts non-excluded members", async () => {
    const board = await boardWith(3);
    await removeFromBoard(board.ids[0], board.id);
    expect((await boardSummaries()).find((s) => s.id === board.id)?.size).toBe(2);
  });

  it("mergeBoards keeps my exclusions from the dropped board", async () => {
    const keep = await boardWith(2, 0, "Keep");
    const drop = await boardWith(2, 0, "Drop");
    await removeFromBoard(drop.ids[1], drop.id);
    await mergeBoards(keep.id, drop.id);
    const rows = await db().query<{ excluded: boolean }>("select excluded from board_items where board_id = $1 and item_id = $2", [keep.id, drop.ids[1]]);
    expect(rows).toEqual([{ excluded: true }]);
    expect((await boardMembers(keep.id)).map((m) => m.itemId)).not.toContain(drop.ids[1]);
  });

  it("mergeBoards with the same board is a no-op", async () => {
    const board = await boardWith(2);
    await mergeBoards(board.id, board.id);
    expect(await boardMembers(board.id)).toHaveLength(2);
  });

  it("moveMembers keeps a pin when the item is already an unpinned member of the target", async () => {
    const from = await boardWith(2, 0, "From");
    const to = await boardWith(1, 4, "To");
    await db().query("insert into board_items (board_id, item_id) values ($1, $2)", [to.id, from.ids[1]]);
    await addToBoard(from.ids[1], from.id);
    await moveMembers(from.id, to.id, [from.ids[1]]);
    expect((await boardMembers(to.id)).find((m) => m.itemId === from.ids[1])?.pinned).toBe(true);
  });

  it("moveMembers leaves an item on the source when it is excluded on the target", async () => {
    const from = await boardWith(2, 0, "From");
    const to = await boardWith(1, 4, "To");
    await removeFromBoard(from.ids[1], to.id);
    await moveMembers(from.id, to.id, [from.ids[1]]);
    expect((await boardMembers(from.id)).map((m) => m.itemId)).toContain(from.ids[1]);
    expect((await boardMembers(to.id)).map((m) => m.itemId)).not.toContain(from.ids[1]);
  });

  it("moveMembers to the same board leaves it intact", async () => {
    const board = await boardWith(2);
    await moveMembers(board.id, board.id, [board.ids[0]]);
    expect(await boardMembers(board.id)).toHaveLength(2);
  });

  it("does not delete a board whose only member has no embedding", async () => {
    const item = await insertTestItem({ embedding: null });
    const board = await createBoard({ name: "NoEmb", description: "", centroid: axis(0), coverItemId: item, members: [{ itemId: item, similarity: 0.9 }] });
    await recomputeBoards([board.id]);
    expect(await boardRow(board.id)).toBeDefined();
  });
});
