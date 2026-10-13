import "server-only";
import { dailyCallCap } from "@/lib/config";
import { db } from "./client";

export class BudgetExceeded extends Error {
  constructor(purpose: string) {
    super(`Today's Gemini ${purpose} budget is spent.`);
  }
}

/** Counts n Gemini calls for today; throws BudgetExceeded once the day's cap is passed. */
export async function spendCalls(purpose: "pipeline" | "search", n = 1): Promise<void> {
  const [row] = await db().query<{ calls: number }>(
    `insert into ai_usage (day, purpose, calls) values (current_date, $1, $2)
     on conflict (day, purpose) do update set calls = ai_usage.calls + excluded.calls
     returning calls`,
    [purpose, n],
  );
  if (row.calls > dailyCallCap(purpose)) throw new BudgetExceeded(purpose);
}
