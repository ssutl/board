import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { axis, insertTestItem, useTestDb } from "@/lib/db/testing";
import { BudgetExceeded } from "@/lib/db/usage";

vi.mock("@/lib/ai/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gemini")>()),
  nameBoard: vi.fn(),
}));
const gemini = await import("@/lib/ai/gemini");
const { growBoards } = await import("./grow");

useTestDb();

beforeEach(() => {
  let n = 0;
  vi.mocked(gemini.nameBoard).mockImplementation(async () => ({ name: `Board ${++n}`, description: "d" }));
});

async function twoGroups() {
  for (let i = 0; i < 6; i++) await insertTestItem({ embedding: axis(0, { 1: i * 0.02 }) });
  for (let i = 0; i < 6; i++) await insertTestItem({ embedding: axis(5, { 6: i * 0.02 }) });
}

describe("growBoards", () => {
  it("forms named boards from Loose", async () => {
    await twoGroups();
    expect(await growBoards()).toBe(2);
    const boards = await db().query<{ name: string; n: number }>(
      "select b.name, (select count(*)::int from board_items bi where bi.board_id = b.id) as n from boards b order by b.name",
    );
    expect(boards).toEqual([{ name: "Board 1", n: 6 }, { name: "Board 2", n: 6 }]);
  });

  it("never makes duplicate boards when two runs overlap", async () => {
    await twoGroups();
    const [a, b] = await Promise.all([growBoards(), growBoards()]);
    expect(a + b).toBe(2);
  });

  it("stops quietly when the budget is spent", async () => {
    await twoGroups();
    vi.mocked(gemini.nameBoard).mockRejectedValue(new BudgetExceeded("pipeline"));
    expect(await growBoards()).toBe(0);
  });
});
