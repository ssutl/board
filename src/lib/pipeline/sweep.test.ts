import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/items", () => ({ claimableIds: vi.fn(), failExhaustedClaims: vi.fn(async () => 0) }));
vi.mock("./process", () => ({ processItem: vi.fn() }));
vi.mock("./grow", () => ({ growBoards: vi.fn(async () => 1) }));

const { claimableIds, failExhaustedClaims } = await import("@/lib/db/items");
const { processItem } = await import("./process");
const { growBoards } = await import("./grow");
const { sweep } = await import("./sweep");

beforeEach(() => vi.clearAllMocks());

describe("sweep", () => {
  it("processes claimable items then grows boards", async () => {
    vi.mocked(claimableIds).mockResolvedValue(["a", "b"]);
    vi.mocked(processItem).mockResolvedValueOnce("ready").mockResolvedValueOnce("failed");
    expect(await sweep(Infinity)).toEqual({ ready: 1, failed: 1, deferred: 0, skipped: 0, boards: 1, timedOut: 0 });
  });

  it("fails exhausted claims once at the start and reports the count", async () => {
    vi.mocked(failExhaustedClaims).mockResolvedValueOnce(2);
    vi.mocked(claimableIds).mockResolvedValue([]);
    const result = await sweep(Infinity);
    expect(failExhaustedClaims).toHaveBeenCalledTimes(1);
    expect(result.timedOut).toBe(2);
  });

  it("stops at the first deferral (budget spent)", async () => {
    vi.mocked(claimableIds).mockResolvedValue(["a", "b", "c"]);
    vi.mocked(processItem).mockResolvedValue("deferred");
    await sweep(Infinity);
    expect(processItem).toHaveBeenCalledTimes(1);
  });

  it("starts nothing once out of time", async () => {
    vi.mocked(claimableIds).mockResolvedValue(["a"]);
    await sweep(100, () => 200);
    expect(processItem).not.toHaveBeenCalled();
    expect(growBoards).not.toHaveBeenCalled();
  });
});
