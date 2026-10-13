import "server-only";
import { hasTime } from "@/lib/ai/budget";
import { claimableIds, failExhaustedClaims } from "@/lib/db/items";
import { growBoards } from "./grow";
import { processItem, type ProcessOutcome } from "./process";

export type SweepResult = Record<ProcessOutcome, number> & { boards: number; timedOut: number };

/** Catches up on anything the drop's after() missed or that failed with attempts left. */
export async function sweep(until: number, now: () => number = Date.now): Promise<SweepResult> {
  const counts: SweepResult = { ready: 0, failed: 0, deferred: 0, skipped: 0, boards: 0, timedOut: await failExhaustedClaims() };
  for (const id of await claimableIds(100)) {
    if (!hasTime(now(), until)) break;
    const outcome = await processItem(id, { until });
    counts[outcome]++;
    if (outcome === "deferred") break; // budget spent or rate-limited: the rest would defer too
  }
  if (hasTime(now(), until)) counts.boards = await growBoards();
  return counts;
}
