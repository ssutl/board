import { afterEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./testing";
import { BudgetExceeded, spendCalls } from "./usage";

useTestDb();
afterEach(() => vi.unstubAllEnvs());

describe("spendCalls", () => {
  it("counts calls per purpose and throws once over the cap", async () => {
    vi.stubEnv("GEMINI_DAILY_CALLS", "3");
    await spendCalls("pipeline", 2);
    await spendCalls("pipeline");
    await expect(spendCalls("pipeline")).rejects.toBeInstanceOf(BudgetExceeded);
  });

  it("keeps search separate from the pipeline", async () => {
    vi.stubEnv("GEMINI_DAILY_CALLS", "1");
    vi.stubEnv("SEARCH_DAILY_CALLS", "5");
    await spendCalls("pipeline");
    await expect(spendCalls("search", 5)).resolves.toBeUndefined();
  });
});
