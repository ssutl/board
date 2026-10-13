import { describe, expect, it } from "vitest";
import { mulberry32, normalize } from "@/lib/vectors/math";
import { plantedClusters } from "@/lib/vectors/testing";
import { findNewBoards } from "./grow";

const asPoints = (points: number[][]) => points.map((embedding, i) => ({ id: `p${i}`, embedding }));

describe("findNewBoards", () => {
  it("does nothing below 12 loose items", () => {
    const { points } = plantedClusters({ k: 1, perCluster: 11, dim: 16 });
    expect(findNewBoards(asPoints(points))).toEqual([]);
  });

  it("finds each planted group as one board", () => {
    const { points, truth } = plantedClusters({ k: 3, perCluster: 8, dim: 16 });
    const boards = findNewBoards(asPoints(points));
    expect(boards).toHaveLength(3);
    for (const b of boards) {
      expect(b.itemIds).toHaveLength(8);
      const groups = new Set(b.itemIds.map((id) => truth[Number(id.slice(1))]));
      expect(groups.size).toBe(1);
      expect(b.itemIds).toContain(b.coverId);
      expect(Object.keys(b.similarities).sort()).toEqual([...b.itemIds].sort());
    }
  });

  it("leaves a group smaller than 6 loose", () => {
    const big = plantedClusters({ k: 2, perCluster: 8, dim: 16 }).points;
    const small = plantedClusters({ k: 3, perCluster: 4, dim: 16, seed: 9 }).points.slice(8); // 4 points around axis 2
    const boards = findNewBoards(asPoints([...big, ...small]));
    expect(boards).toHaveLength(2);
    expect(boards.flatMap((b) => b.itemIds)).toHaveLength(16);
  });

  it("finds nothing in scattered noise", () => {
    const random = mulberry32(3);
    const noise = Array.from({ length: 30 }, () => normalize(Array.from({ length: 16 }, () => random() - 0.5)));
    expect(findNewBoards(asPoints(noise))).toEqual([]);
  });

  it("is deterministic", () => {
    const { points } = plantedClusters({ k: 3, perCluster: 8, dim: 16 });
    expect(findNewBoards(asPoints(points))).toEqual(findNewBoards(asPoints(points)));
  });
});
