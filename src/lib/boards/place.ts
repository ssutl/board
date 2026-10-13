import { JOIN_THRESHOLD, MAX_BOARDS_PER_ITEM } from "@/lib/config";
import { dot } from "@/lib/vectors/math";

export type Placement = { boardId: string; similarity: number };

/**
 * The boards an item joins: every one at least `threshold` similar, best first, `max` at most.
 * Callers pass only boards the item may join (not hidden, not excluded, not already pinned).
 */
export function placeItem(
  embedding: number[],
  boards: { id: string; centroid: number[] }[],
  { threshold = JOIN_THRESHOLD, max = MAX_BOARDS_PER_ITEM }: { threshold?: number; max?: number } = {},
): Placement[] {
  if (max <= 0) return [];
  return boards
    .map((b) => ({ boardId: b.id, similarity: dot(embedding, b.centroid) }))
    .filter((p) => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, max);
}
