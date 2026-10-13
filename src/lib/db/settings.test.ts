import { describe, expect, it } from "vitest";
import { acquireLease, getSetting, releaseLease, setSetting } from "./settings";
import { db } from "./client";
import { useTestDb } from "./testing";
import { openSuggestion, suggestionExists, boardsWithOpenSuggestions } from "./suggestions";

useTestDb();

describe("settings", () => {
  it("stores values", async () => {
    expect(await getSetting("k")).toBeNull();
    await setSetting("k", "v");
    await setSetting("k", "w");
    expect(await getSetting("k")).toBe("w");
  });

  it("leases are exclusive until released or expired", async () => {
    expect(await acquireLease("grow_lock", 60_000)).toBe(true);
    expect(await acquireLease("grow_lock", 60_000)).toBe(false);
    await releaseLease("grow_lock");
    expect(await acquireLease("grow_lock", 60_000)).toBe(true);
    await db().query("update settings set value = '1' where key = 'grow_lock'");
    expect(await acquireLease("grow_lock", 60_000)).toBe(true);
  });
});

describe("suggestions", () => {
  it("dedupes by fingerprint and reports boards with open suggestions", async () => {
    const s = { type: "merge" as const, payload: { keepId: "k", dropId: "d", similarity: 0.95 } };
    expect(await openSuggestion(s, "fp")).toBe(true);
    expect(await openSuggestion(s, "fp")).toBe(false);
    expect(await suggestionExists("fp")).toBe(true);
    expect([...(await boardsWithOpenSuggestions())].sort()).toEqual(["d", "k"]);
  });
});
