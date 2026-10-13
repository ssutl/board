import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugs", () => {
  it("slugifies names", () => {
    expect(slugify("Analog 80s")).toBe("analog-80s");
    expect(slugify("  Café — Brushed Aluminium! ")).toBe("cafe-brushed-aluminium");
    expect(slugify("!!!")).toBe("board");
  });
  it("adds a number when taken", () => {
    expect(uniqueSlug("night-blue", [])).toBe("night-blue");
    expect(uniqueSlug("night-blue", ["night-blue", "night-blue-2"])).toBe("night-blue-3");
  });
});
