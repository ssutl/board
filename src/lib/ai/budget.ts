/**
 * Time budgets for the Gemini work a request can afford. Pure: every function takes the
 * current time, so the callers (imports, actions, scripts) decide where it comes from.
 */

/** No budget at all: work until it's done. */
export const NO_DEADLINE = Infinity;

/**
 * Epoch ms at which work must stop starting: the soonest of `cap` from `now` and `deadline`
 * less `margin` (the room the caller needs to save and reply). `NO_DEADLINE` when neither is
 * given; never before `now`, so a budget that's already gone simply starts nothing.
 */
export function stopAt({ now, cap, deadline, margin = 0 }: { now: number; cap?: number; deadline?: number; margin?: number }): number {
  const ends = [cap === undefined ? NO_DEADLINE : now + cap, deadline === undefined ? NO_DEADLINE : deadline - margin];
  const end = Math.min(...ends);
  return end === NO_DEADLINE ? NO_DEADLINE : Math.max(now, end);
}

/** Whether more work may be started. */
export const hasTime = (now: number, until: number): boolean => now < until;

/**
 * How long a single call may take: `cap`, or what's left until `until` when that's sooner.
 * Never below `min` — a call given a moment is better cancelled by its own deadline than
 * started with a signal that aborts at once.
 */
export function callTimeout(now: number, until: number, cap: number, min = 5_000): number {
  if (until === NO_DEADLINE) return cap;
  return Math.max(min, Math.min(cap, until - now));
}

/** Whether waiting out a rate limit of `delayMs` still leaves time to do the work after it. */
export const canWait = (now: number, until: number, delayMs: number): boolean => now + delayMs < until;
