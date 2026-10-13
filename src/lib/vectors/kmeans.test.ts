import { describe, expect, it } from "vitest";
import { kmeans, nearest } from "./kmeans";
import { dot, mulberry32, normalize } from "./math";
import { plantedClusters, sameGrouping } from "./testing";

describe("math", () => {
  it("normalises to unit length and leaves zero vectors alone", () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it("mulberry32 repeats for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("kmeans", () => {
  const { points, truth } = plantedClusters({ k: 4, perCluster: 20, dim: 8 });

  it("recovers planted clusters", () => {
    expect(sameGrouping(kmeans(points, 4).labels, truth)).toBe(true);
  });

  it("gives identical results for the same seed", () => {
    expect(kmeans(points, 4, { seed: 3 })).toEqual(kmeans(points, 4, { seed: 3 }));
  });

  it("returns unit-length centroids", () => {
    for (const c of kmeans(points, 4).centroids) expect(Math.sqrt(dot(c, c))).toBeCloseTo(1, 6);
  });

  it("never leaves a cluster empty", () => {
    const { labels } = kmeans(points, 10);
    expect(new Set(labels).size).toBe(10);
  });

  it("rejects an impossible k", () => {
    expect(() => kmeans(points, 0)).toThrow();
    expect(() => kmeans(points, points.length + 1)).toThrow();
  });

  it("nearest picks the most similar centroid", () => {
    expect(nearest([1, 0], [[0, 1], [1, 0]])).toEqual({ index: 1, similarity: 1 });
  });
});
