import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/vectors/math";
import { centroidOf } from "@/lib/vectors/centroid";
import { placeItem } from "./place";

const v = (...xs: number[]) => normalize([...xs, ...new Array(8 - xs.length).fill(0)]);

describe("centroidOf", () => {
  it("is the unit-length mean", () => {
    expect(centroidOf([v(1, 0), v(0, 1)])).toEqual(v(1, 1));
  });
  it("throws on nothing", () => {
    expect(() => centroidOf([])).toThrow();
  });
});

describe("placeItem", () => {
  const boards = [
    { id: "a", centroid: v(1, 0, 0, 0) },
    { id: "b", centroid: v(0.9, 0.1, 0, 0) },
    { id: "c", centroid: v(0.8, 0.2, 0, 0) },
    { id: "d", centroid: v(0.85, 0.15, 0, 0) },
    { id: "far", centroid: v(0, 0, 1, 0) },
  ];

  it("joins boards above the threshold, best first, at most 3", () => {
    const placed = placeItem(v(1, 0.05, 0, 0), boards);
    expect(placed.map((p) => p.boardId)).toEqual(["a", "b", "d"]);
    expect(placed[0].similarity).toBeGreaterThan(placed[1].similarity);
  });

  it("joins nothing when nothing is close (stays Loose)", () => {
    expect(placeItem(v(0, 0, 0, 1), boards)).toEqual([]);
  });

  it("respects a smaller max (room left after pinned boards)", () => {
    expect(placeItem(v(1, 0, 0, 0), boards, { max: 1 }).map((p) => p.boardId)).toEqual(["a"]);
    expect(placeItem(v(1, 0, 0, 0), boards, { max: 0 })).toEqual([]);
  });
});
