import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/vectors/math";
import { plantedClusters } from "@/lib/vectors/testing";
import { findMerges, findSplit, fingerprint } from "./suggest";

const asPoints = (points: number[][]) => points.map((embedding, i) => ({ id: `p${i}`, embedding }));
const v = (...xs: number[]) => normalize([...xs, ...new Array(8 - xs.length).fill(0)]);

describe("findSplit", () => {
  it("splits a board made of two distinct groups, larger first", () => {
    const { points } = plantedClusters({ k: 2, perCluster: 8, dim: 16 });
    const extra = plantedClusters({ k: 1, perCluster: 2, dim: 16, seed: 4 }).points; // 2 more near axis 0
    const split = findSplit(asPoints([...points, ...extra]));
    expect(split).not.toBeNull();
    expect(split!.groups[0]).toHaveLength(10);
    expect(split!.groups[1]).toHaveLength(8);
    expect(split!.similarity).toBeLessThan(0.6);
  });

  it("leaves a coherent board alone", () => {
    const { points } = plantedClusters({ k: 1, perCluster: 16, dim: 16 });
    expect(findSplit(asPoints(points))).toBeNull();
  });

  it("ignores boards under 12 items", () => {
    const { points } = plantedClusters({ k: 2, perCluster: 5, dim: 16 });
    expect(findSplit(asPoints(points))).toBeNull();
  });
});

describe("findMerges", () => {
  it("pairs near-identical boards, keeping the bigger one", () => {
    const merges = findMerges([
      { id: "a", centroid: v(1, 0), size: 5 },
      { id: "b", centroid: v(1, 0.05), size: 9 },
      { id: "c", centroid: v(0, 1), size: 7 },
    ]);
    expect(merges).toEqual([{ keepId: "b", dropId: "a", similarity: expect.any(Number) }]);
  });

  it("uses each board in at most one merge", () => {
    const merges = findMerges([
      { id: "a", centroid: v(1, 0), size: 5 },
      { id: "b", centroid: v(1, 0.01), size: 5 },
      { id: "c", centroid: v(1, 0.02), size: 5 },
    ]);
    expect(merges).toHaveLength(1);
  });
});

describe("fingerprint", () => {
  it("ignores order and differs by type", () => {
    expect(fingerprint("split", ["b", "a"])).toBe(fingerprint("split", ["a", "b"]));
    expect(fingerprint("split", ["a"])).not.toBe(fingerprint("merge", ["a"]));
  });
});
