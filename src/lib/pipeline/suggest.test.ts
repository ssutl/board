import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { addToBoard, boardMembers, createBoard } from "@/lib/db/boards";
import { listOpenSuggestions } from "@/lib/db/suggestions";
import { BudgetExceeded } from "@/lib/db/usage";
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

  const hiddenOf = async (id: string) => (await db().query<{ hidden: boolean }>("select hidden from boards where id = $1", [id]))[0].hidden;

  it("a split of a hidden board stays hidden", async () => {
    const mixed = await board("Mixed", [[0, 7], [10, 6]]);
    await runSuggestions();
    const [s] = await listOpenSuggestions();
    await db().query("update boards set hidden = true where id = $1", [mixed.id]); // hidden without going through setBoardHidden
    await acceptSuggestion(s.id);
    const boards = await db().query<{ hidden: boolean }>("select hidden from boards");
    expect(boards.map((b) => b.hidden)).toEqual([true, true]);
  });

  it("a merge keeps the board hidden if either was hidden", async () => {
    const a = await board("A", [[0, 6]]);
    const b = await board("B", [[0, 7]]);
    await runSuggestions();
    const [s] = await listOpenSuggestions();
    await db().query("update boards set hidden = true where id = $1", [a.id]);
    await acceptSuggestion(s.id);
    expect(await hiddenOf(b.id)).toBe(true);
  });

  async function splittableAndMergeable() {
    await board("Mixed", [[0, 7], [10, 6]]);
    await board("A", [[20, 6]]);
    await board("B", [[20, 7]]);
  }

  it("a bad nameBoard reply skips that board but merges still open", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(gemini.nameBoard).mockRejectedValue(new SyntaxError("bad json"));
    await splittableAndMergeable();
    expect(await runSuggestions()).toBe(1);
    expect((await listOpenSuggestions()).map((s) => s.type)).toEqual(["merge"]);
  });

  it("a budget error during splits still lets merges open", async () => {
    vi.mocked(gemini.nameBoard).mockRejectedValue(new BudgetExceeded("pipeline"));
    await splittableAndMergeable();
    expect(await runSuggestions()).toBe(1);
    expect((await listOpenSuggestions()).map((s) => s.type)).toEqual(["merge"]);
  });
});
