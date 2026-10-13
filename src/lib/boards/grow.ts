import { JOIN_THRESHOLD, MIN_BOARD_SIZE, MIN_LOOSE_TO_GROW, TIGHT_THRESHOLD } from "@/lib/config";
import { centroidOf } from "@/lib/vectors/centroid";
import { dot } from "@/lib/vectors/math";

export type Point = { id: string; embedding: number[] };
export type NewBoard = { itemIds: string[]; centroid: number[]; coverId: string; similarities: Record<string, number> };
export type GrowOptions = { minLoose: number; minSize: number; tight: number; join: number };

const DEFAULTS: GrowOptions = { minLoose: MIN_LOOSE_TO_GROW, minSize: MIN_BOARD_SIZE, tight: TIGHT_THRESHOLD, join: JOIN_THRESHOLD };

/**
 * New boards from the Loose pile, deterministically (seed-and-grow, not k-means, so two real
 * groups are never forced into k ≥ 3 fragments):
 * 1. seed = the point with the most neighbours at ≥ tight similarity (ties: earliest);
 * 2. members = every remaining point within `join` of the seed group's centroid;
 * 3. keep it if it has ≥ minSize members averaging ≥ tight to their centroid;
 * repeat on what's left until no seed has enough neighbours.
 */
export function findNewBoards(points: Point[], options: Partial<GrowOptions> = {}): NewBoard[] {
  const o = { ...DEFAULTS, ...options };
  const n = points.length;
  if (n < o.minLoose) return [];

  const S = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    S[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) S[i * n + j] = S[j * n + i] = dot(points[i].embedding, points[j].embedding);
  }

  const remaining = new Set(points.map((_, i) => i));
  const tried = new Set<number>();
  const out: NewBoard[] = [];

  for (;;) {
    let seed = -1;
    let best = 0;
    for (const i of remaining) {
      if (tried.has(i)) continue;
      let count = 0;
      for (const j of remaining) if (S[i * n + j] >= o.tight) count++;
      if (count > best) {
        best = count;
        seed = i;
      }
    }
    if (seed < 0 || best < o.minSize) break;
    tried.add(seed);

    const core = [...remaining].filter((j) => S[seed * n + j] >= o.tight);
    const seedCentroid = centroidOf(core.map((j) => points[j].embedding));
    const members = [...remaining].filter((j) => dot(points[j].embedding, seedCentroid) >= o.join);
    if (members.length < o.minSize) continue;

    const centroid = centroidOf(members.map((j) => points[j].embedding));
    const sims = members.map((j) => dot(points[j].embedding, centroid));
    if (sims.reduce((a, b) => a + b, 0) / sims.length < o.tight) continue;

    let cover = 0;
    sims.forEach((s, k) => {
      if (s > sims[cover]) cover = k;
    });
    out.push({
      itemIds: members.map((j) => points[j].id),
      centroid,
      coverId: points[members[cover]].id,
      similarities: Object.fromEntries(members.map((j, k) => [points[j].id, sims[k]])),
    });
    for (const j of members) remaining.delete(j);
  }
  return out;
}
