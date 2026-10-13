import { createHash } from "node:crypto";
import { MERGE_THRESHOLD, MIN_BOARD_SIZE, MIN_SPLIT_BOARD, SPLIT_THRESHOLD } from "@/lib/config";
import { kmeans } from "@/lib/vectors/kmeans";
import { dot } from "@/lib/vectors/math";
import type { Point } from "./grow";

export type BoardSummary = { id: string; centroid: number[]; size: number };

/** Two clearly different halves inside one board, or null. Larger group first (it keeps the board). */
export function findSplit(
  members: Point[],
  { minBoard = MIN_SPLIT_BOARD, minSize = MIN_BOARD_SIZE, threshold = SPLIT_THRESHOLD } = {},
): { groups: [string[], string[]]; similarity: number } | null {
  if (members.length < minBoard) return null;
  const { labels, centroids } = kmeans(
    members.map((m) => m.embedding),
    2,
    { seed: 1 },
  );
  const groups: [string[], string[]] = [[], []];
  labels.forEach((label, i) => groups[label].push(members[i].id));
  if (groups[0].length < minSize || groups[1].length < minSize) return null;
  const similarity = dot(centroids[0], centroids[1]);
  if (similarity >= threshold) return null;
  return { groups: groups[0].length >= groups[1].length ? groups : [groups[1], groups[0]], similarity };
}

/** Pairs of near-identical boards, most similar first; each board in one pair at most. */
export function findMerges(boards: BoardSummary[], threshold = MERGE_THRESHOLD): { keepId: string; dropId: string; similarity: number }[] {
  const pairs: { a: BoardSummary; b: BoardSummary; similarity: number }[] = [];
  for (let i = 0; i < boards.length; i++)
    for (let j = i + 1; j < boards.length; j++) {
      const similarity = dot(boards[i].centroid, boards[j].centroid);
      if (similarity >= threshold) pairs.push({ a: boards[i], b: boards[j], similarity });
    }
  pairs.sort((x, y) => y.similarity - x.similarity);
  const used = new Set<string>();
  const out: { keepId: string; dropId: string; similarity: number }[] = [];
  for (const { a, b, similarity } of pairs) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id);
    used.add(b.id);
    const [keep, drop] = a.size > b.size || (a.size === b.size && a.id < b.id) ? [a, b] : [b, a];
    out.push({ keepId: keep.id, dropId: drop.id, similarity });
  }
  return out;
}

/** Same type and same ids (any order) → same fingerprint, so a rejected suggestion never reopens. */
export function fingerprint(type: "split" | "merge", ids: string[]): string {
  return `${type}:${createHash("sha256").update([...ids].sort().join(",")).digest("hex")}`;
}
