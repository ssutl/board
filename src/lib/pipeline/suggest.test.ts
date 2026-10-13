import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { addToBoard, boardMembers, createBoard } from "@/lib/db/boards";
import { listOpenSuggestions } from "@/lib/db/suggestions";
import { axis, insertTestItem, useTestDb } from "@/lib/db/testing";

vi.mock("@/lib/ai/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gemini")>()),
  nameBoard: vi.fn(),
}));
const gemini = await import("@/lib/ai/gemini");
const { acceptSuggestion, rejectSuggestion, runSuggestions } = await import("./suggest");

useTestDb();

beforeEach(() => {
  let n = 0;
  vi.mocked(gemini.nameBoard).mockImplementation(async () => ({ name: `Half ${++n}`, description: "d" }));
});

async function board(name: string, axes: number[][]) {
  const ids: string[] = [];
  for (const [a, count] of axes) for (let i = 0; i < count; i++) ids.push(await insertTestItem({ embedding: axis(a, { [a + 1]: i * 0.02 }) }));
  const b = await createBoard({ name, description: "", centroid: axis(axes[0][0]), coverItemId: ids[0], members: ids.map((itemId) => ({ itemId, similarity: 0.8 })) });
  return { ...b, ids };
}

describe("suggestions", () => {
  it("proposes a split for a board made of two groups, once", async () => {
    await board("Mixed", [[0, 7], [10, 6]]);
    expect(await runSuggestions()).toBe(1);
    const [s] = await listOpenSuggestions();
    expect(s.type).toBe("split");
    expect(await runSuggestions()).toBe(0); // board already has an open suggestion
    await rejectSuggestion(s.id);
    expect(await runSuggestions()).toBe(0); // same membership: not reopened
  });

  it("proposes a merge for near-identical boards", async () => {
    await board("A", [[0, 6]]);
    await board("B", [[0, 7]]);
    expect(await runSuggestions()).toBe(1);
    expect((await listOpenSuggestions())[0].type).toBe("merge");
  });

  it("accepting a split moves the second group to a new board, pinned carried", async () => {
    const mixed = await board("Mixed", [[0, 7], [10, 6]]);
    const moved = mixed.ids.slice(7);
    await addToBoard(moved[0], mixed.id); // pinned
    await runSuggestions();
    const [s] = await listOpenSuggestions();
    await acceptSuggestion(s.id);
    const boards = await db().query<{ id: string; name: string }>("select id, name from boards order by created_at");
    expect(boards.map((b) => b.name)).toEqual(["Half 1", "Half 2"]);
    const newMembers = await boardMembers(boards[1].id);
    expect(newMembers.map((m) => m.itemId).sort()).toEqual([...moved].sort());
    expect(newMembers.find((m) => m.itemId === moved[0])?.pinned).toBe(true);
    expect(await boardMembers(mixed.id)).toHaveLength(7);
  });

  it("accepting a merge removes the smaller board", async () => {
    await board("A", [[0, 6]]);
    const b = await board("B", [[0, 7]]);
    await runSuggestions();
    const [s] = await listOpenSuggestions();
    await acceptSuggestion(s.id);
    expect((await db().query<{ id: string }>("select id from boards")).map((r) => r.id)).toEqual([b.id]);
    await expect(acceptSuggestion(s.id)).rejects.toThrow(/no longer open/);
  });
});
