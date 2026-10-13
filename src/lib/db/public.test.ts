import { describe, expect, it } from "vitest";
import { createBoard, removeFromBoard, setBoardHidden } from "./boards";
import { db } from "./client";
import { axis, insertTestItem, useTestDb } from "./testing";
import { boardItems, boardPalette, boardsForItem, getPublicBoard, getPublicItem, listPublicBoards, searchPublic, similarPublicItems, unsortedItems } from "./public";

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

  it("Loose items are public and unsorted, newest first; removed-from-every-board counts as Loose", async () => {
    const older = await insertTestItem({ embedding: axis(0), createdAt: "2026-01-01T00:00:00Z" });
    const newer = await insertTestItem({ embedding: axis(0), createdAt: "2026-02-01T00:00:00Z" });
    const a = await insertTestItem({ embedding: axis(0) });
    const b = await insertTestItem({ embedding: axis(0) });
    const board = await boardOf("B", [a, b]);
    await removeFromBoard(b, board.id);
    expect(await getPublicItem(older)).not.toBeNull();
    expect(await getPublicItem(b)).not.toBeNull();
    expect((await searchPublic(axis(0))).items.map((i) => i.id)).toEqual(expect.arrayContaining([older, newer, a, b]));
    expect((await unsortedItems()).map((i) => i.id)).toEqual([b, newer, older]);
  });

  it("unsorted never includes hidden, pending, link or on-a-hidden-board items", async () => {
    await insertTestItem({ embedding: axis(0), hidden: true });
    await insertTestItem({ embedding: axis(0), status: "pending" });
    await insertTestItem({ kind: "link", imageUrl: "" });
    const onHidden = await insertTestItem({ embedding: axis(0) });
    const secret = await boardOf("Secret", [onHidden]);
    await setBoardHidden(secret.id, true);
    expect(await unsortedItems()).toEqual([]);
    expect(await getPublicItem(onHidden)).toBeNull();
  });

  it("similarPublicItems gives [] for a non-public or missing source id", async () => {
    const a = await insertTestItem({ embedding: axis(0) });
    const b = await insertTestItem({ embedding: axis(0) });
    await boardOf("Pub", [a, b]);
    const onHidden = await insertTestItem({ embedding: axis(0) });
    const secret = await boardOf("Secret", [onHidden], 4);
    await setBoardHidden(secret.id, true);
    const hidden = await insertTestItem({ embedding: axis(0), hidden: true });
    expect((await similarPublicItems(a)).length).toBe(1);
    for (const id of [onHidden, hidden, "00000000-0000-4000-8000-000000000000"]) expect(await similarPublicItems(id)).toEqual([]);
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
