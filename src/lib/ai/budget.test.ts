import { describe, expect, it } from "vitest";
import { callTimeout, canWait, hasTime, NO_DEADLINE, stopAt } from "./budget";

describe("stopAt", () => {
  it("is the cap when there is no deadline", () => {
    expect(stopAt({ now: 1000, cap: 60_000 })).toBe(61_000);
  });

  it("is the deadline less the margin when that comes first", () => {
    expect(stopAt({ now: 1000, cap: 60_000, deadline: 30_000, margin: 5_000 })).toBe(25_000);
  });

  it("is the cap when the deadline is further off", () => {
    expect(stopAt({ now: 1000, cap: 60_000, deadline: 300_000, margin: 5_000 })).toBe(61_000);
  });

  it("is now when the budget is already spent, so nothing starts", () => {
    expect(stopAt({ now: 100_000, cap: 60_000, deadline: 100_000, margin: 10_000 })).toBe(100_000);
    expect(hasTime(100_000, stopAt({ now: 100_000, deadline: 50_000 }))).toBe(false);
  });

  it("is open-ended with neither a cap nor a deadline", () => {
    expect(stopAt({ now: 1000 })).toBe(NO_DEADLINE);
    expect(hasTime(1e15, NO_DEADLINE)).toBe(true);
  });
});

describe("callTimeout", () => {
  it("is the cap when there is time to spare, or none at all", () => {
    expect(callTimeout(1000, 200_000, 30_000)).toBe(30_000);
    expect(callTimeout(1000, NO_DEADLINE, 30_000)).toBe(30_000);
  });

  it("shrinks to what is left", () => {
    expect(callTimeout(1000, 21_000, 30_000)).toBe(20_000);
  });

  it("never goes below the floor", () => {
    expect(callTimeout(1000, 1_100, 30_000)).toBe(5_000);
  });
});

describe("canWait", () => {
  it("allows a pause that still leaves time", () => {
    expect(canWait(1000, 60_000, 30_000)).toBe(true);
    expect(canWait(1000, 20_000, 30_000)).toBe(false);
    expect(canWait(1000, NO_DEADLINE, 65_000)).toBe(true);
  });
});
