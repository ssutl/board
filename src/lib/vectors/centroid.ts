import { normalize } from "./math";

/** The unit-length mean direction of the vectors: a board's "average look". */
export function centroidOf(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("centroidOf needs at least one vector.");
  const sum = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let d = 0; d < v.length; d++) sum[d] += v[d];
  return normalize(sum);
}
