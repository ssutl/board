import { describe, expect, it } from "vitest";
import { parseLook } from "./look";

describe("parseLook", () => {
  it("parses a full reply and keeps only known palette colours", () => {
    const look = parseLook(
      JSON.stringify({
        box: [80, 0, 900, 1000],
        caption: "Red 1980s Porsche 911 Turbo, side profile",
        what: "Porsche 911 Turbo",
        colours: ["guards red", "black"],
        palette: ["Red", "black", "chartreuse", "red"],
        materials: ["paint", "chrome"],
        era: "1980s",
        mood: ["aggressive", "clean"],
      }),
    );
    expect(look.box).toEqual([80, 0, 900, 1000]);
    expect(look.tags.palette).toEqual(["red", "black"]);
    expect(look.tags.what).toBe("Porsche 911 Turbo");
  });

  it("fills defaults for missing optional fields and accepts a null box", () => {
    const look = parseLook(JSON.stringify({ box: null, caption: "A chair" }));
    expect(look).toEqual({ box: null, caption: "A chair", tags: { what: "", colours: [], palette: [], materials: [], era: "", mood: [] } });
  });

  it("throws on malformed JSON, an empty caption, or a box that isn't 4 numbers", () => {
    expect(() => parseLook("not json")).toThrow();
    expect(() => parseLook(JSON.stringify({ box: null, caption: "  " }))).toThrow();
    expect(() => parseLook(JSON.stringify({ box: [1, 2, 3], caption: "x" }))).toThrow();
  });
});
