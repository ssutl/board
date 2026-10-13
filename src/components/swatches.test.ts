import { describe, expect, it } from "vitest";
import { PALETTE } from "@/lib/config";
import { SWATCHES } from "./swatches";

describe("SWATCHES", () => {
  it("has a hex colour for every palette word", () => {
    for (const c of PALETTE) expect(SWATCHES[c]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
