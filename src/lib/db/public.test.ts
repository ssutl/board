import { describe, expect, it } from "vitest";
import { createBoard, removeFromBoard, setBoardHidden } from "./boards";
import { db } from "./client";
import { axis, insertTestItem, useTestDb } from "./testing";
import { boardItems, boardPalette, boardsForItem, getPublicBoard, getPublicItem, listPublicBoards, searchPublic, similarPublicItems } from "./public";

useTestDb();

async function boardOf(name: string, ids: string[], at = 0) {
  return createBoard({ name, description: "desc", centroid: axis(at), coverItemId: ids[0], members: ids.map((itemId) => ({ itemId, similarity: 0.9 })) });
}

async function everywhere(id: string, boardId: string) {
  const list = (await listPublicBoards()).find((b) => b.id === boardId);
  return {
    item: !!(await getPublicItem(id)),
    inBoard: (await boardItems(boardId)).some((i) => i.id === id),
    inSearch: (await searchPublic(axis(0))).items.some((i) => i.id === id),
    count: list?.count ?? 0,
  };
}

describe("public visibility", () => {
  it("shows a ready item on a visible board everywhere", async () => {
    const a = await insertTestItem({ embedding: axis(0) });
    const b = await insertTestItem({ embedding: axis(0, { 1: 0.1 }) });
    const board = await boardOf("Red", [a, b]);
    expect(await everywhere(a, board.id)).toEqual({ item: true, inBoard: true, inSearch: true, count: 2 });
    expect((await similarPublicItems(a)).map((i) => i.id)).toEqual([b]);
    expect(await boardsForItem(a)).toEqual([{ slug: "red", name: "Red" }]);
    expect(await getPublicBoard("red")).toMatchObject({ name: "Red", coverUrl: expect.stringContaining("https://") });
  });

  it("never shows pending, failed or hidden items", async () => {
    const ok = await insertTestItem({ embedding: axis(0) });
    const pending = await insertTestItem({ embedding: axis(0), status: "pending" });
    const failed = await insertTestItem({ embedding: axis(0), status: "failed" });
    const hidden = await insertTestItem({ embedding: axis(0), hidden: true });
    const board = await boardOf("Mixed", [ok, pending, failed, hidden]);
    for (const id of [pending, failed, hidden]) expect(await everywhere(id, board.id)).toEqual({ item: false, inBoard: false, inSearch: false, count: 1 });
  });

  it("a hidden board hides its items unless they are on another visible board", async () => {
    const only = await insertTestItem({ embedding: axis(0) });
    const shared = await insertTestItem({ embedding: axis(0) });
    const secret = await boardOf("Secret", [only, shared]);
    const open = await boardOf("Open", [shared], 4);
    await setBoardHidden(secret.id, true);
    expect(await getPublicItem(only)).toBeNull();
    expect(await getPublicItem(shared)).not.toBeNull();
    expect(await getPublicBoard("secret")).toBeNull();
    expect((await listPublicBoards()).map((b) => b.id)).toEqual([open.id]);
    expect((await searchPublic(axis(0))).boards.map((b) => b.slug)).toEqual(["open"]);
  });

  it("Loose and excluded items are private", async () => {
    const loose = await insertTestItem({ embedding: axis(0) });
    const a = await insertTestItem({ embedding: axis(0) });
    const b = await insertTestItem({ embedding: axis(0) });
    const board = await boardOf("B", [a, b]);
    await removeFromBoard(b, board.id);
    expect(await getPublicItem(loose)).toBeNull();
    expect(await getPublicItem(b)).toBeNull();
  });

  it("a malformed id is a plain miss, not an error", async () => {
    expect(await getPublicItem("../etc")).toBeNull();
  });

  it("the home mosaic falls back when the cover is gone", async () => {
    const ids = [await insertTestItem({ embedding: axis(0) }), await insertTestItem({ embedding: axis(0) })];
    await boardOf("Covers", ids);
    await db().query("delete from items where id = $1", [ids[0]]);
    const [card] = await listPublicBoards();
    expect(card.images).toHaveLength(1);
  });

  it("filters by palette colour and lists the board's colours", async () => {
    const red = await insertTestItem({ embedding: axis(0), palette: ["red", "black"] });
    const blue = await insertTestItem({ embedding: axis(0), palette: ["blue"] });
    const board = await boardOf("Colours", [red, blue]);
    expect((await boardItems(board.id, "red")).map((i) => i.id)).toEqual([red]);
    expect(await boardPalette(board.id)).toEqual([
      { colour: "black", count: 1 },
      { colour: "blue", count: 1 },
      { colour: "red", count: 1 },
    ]);
  });
});
