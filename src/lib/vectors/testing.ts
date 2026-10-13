import { mulberry32, normalize } from "./math";

/**
 * Unit vectors in k tight groups, one around each of the first k axes. `truth[i]`
 * is the group point i was drawn from. Used by clustering tests.
 */
export function plantedClusters({ k, perCluster, dim, noise = 0.3, seed = 7 }: { k: number; perCluster: number; dim: number; noise?: number; seed?: number }) {
  const random = mulberry32(seed);
  const points: number[][] = [];
  const truth: number[] = [];
  for (let c = 0; c < k; c++) {
    for (let i = 0; i < perCluster; i++) {
      const v = Array.from({ length: dim }, (_, d) => (d === c ? 1 : 0) + (random() - 0.5) * noise);
      points.push(normalize(v));
      truth.push(c);
    }
  }
  return { points, truth };
}

/** True when two labellings group the points the same way, whatever the label numbers. */
export function sameGrouping(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if ((a[i] === a[j]) !== (b[i] === b[j])) return false;
  return true;
}
