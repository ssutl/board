import "server-only";
import { canWait, NO_DEADLINE } from "@/lib/ai/budget";
import { embedImage, lookAt, rateLimitDelayMs } from "@/lib/ai/gemini";
import { placeItem } from "@/lib/boards/place";
import { MAX_BOARDS_PER_ITEM } from "@/lib/config";
import { boardsForPlacement, recomputeBoards, replaceAutoMemberships } from "@/lib/db/boards";
import { claimItem, markFailed, markReady, releaseClaim, saveProcessed, type ItemRow } from "@/lib/db/items";
import { BudgetExceeded } from "@/lib/db/usage";
import { cropRect, normalizeImage, renderVariants } from "@/lib/images/crop";
import { deleteFiles, download, putImage } from "@/lib/storage";

export type ProcessOutcome = "ready" | "failed" | "deferred" | "skipped";

/** Errors that mean "try again later" rather than "this item is broken". */
export const isTransient = (error: unknown) => error instanceof BudgetExceeded || rateLimitDelayMs(error) !== null;

export type ProcessOptions = {
  /** Epoch ms after which no rate-limit wait may end (the sweep's budget). */
  until?: number;
  sleep?: (ms: number) => Promise<void>;
};

const MAX_RATE_LIMIT_WAIT_MS = 65_000; // Reads' cap
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Look → crop → store → embed → place. Safe to call twice: only the run that claims the item works on it.
 * A Gemini rate limit (not the daily budget) is waited out once, up to 65 s, then the item is deferred.
 */
export async function processItem(id: string, { until = NO_DEADLINE, sleep = wait }: ProcessOptions = {}): Promise<ProcessOutcome> {
  const item = await claimItem(id);
  if (!item) return "skipped";
  const stamp = Date.now(); // shared by a retry, so its uploads overwrite the first try's
  let retried = false;
  for (;;) {
    try {
      return await work(item, stamp);
    } catch (error) {
      const delay = rateLimitDelayMs(error);
      if (!retried && delay !== null && delay <= MAX_RATE_LIMIT_WAIT_MS && canWait(Date.now(), until, delay)) {
        retried = true;
        await sleep(delay);
        continue;
      }
      if (isTransient(error)) {
        await releaseClaim(id);
        return "deferred";
      }
      console.error(`processItem ${id}`, error);
      await markFailed(id, error instanceof Error ? error.message : String(error));
      return "failed";
    }
  }
}

async function work(item: ItemRow, stamp: number): Promise<"ready"> {
  const id = item.id;
  if (!item.original_url) throw new Error("Item has no original image.");
  const normal = await normalizeImage(await download(item.original_url));
  const look = await lookAt(normal.bytes);
  const rect = item.use_crop ? cropRect(look.box, normal.width, normal.height) : null;
  const { shown, uncropped } = await renderVariants(normal.bytes, rect);
  const imageUrl = await putImage(`items/${id}/shown-${stamp}.jpg`, shown.bytes, "image/jpeg");
  const uncroppedUrl = shown === uncropped ? imageUrl : await putImage(`items/${id}/full-${stamp}.jpg`, uncropped.bytes, "image/jpeg");
  const embedding = await embedImage(shown.bytes, look.caption);
  await saveProcessed(id, { imageUrl, uncroppedUrl, width: shown.width, height: shown.height, caption: look.caption, tags: look.tags, embedding });
  await placeOnBoards(id, embedding);
  await markReady(id);
  const stale = [item.image_url, item.uncropped_url].filter((u): u is string => !!u && u !== imageUrl && u !== uncroppedUrl);
  if (stale.length) await deleteFiles(stale).catch((e) => console.warn("could not delete old files", e));
  return "ready";
}

/** Auto-places an item: never on hidden or excluded boards; pinned boards count toward the 3. */
export async function placeOnBoards(itemId: string, embedding: number[]): Promise<void> {
  const boards = await boardsForPlacement(itemId);
  const pinned = boards.filter((b) => b.pinned).length;
  const candidates = boards.filter((b) => !b.hidden && !b.excluded && !b.pinned);
  const placements = placeItem(embedding, candidates, { max: MAX_BOARDS_PER_ITEM - pinned });
  await replaceAutoMemberships(itemId, placements);
  await recomputeBoards([...boards.filter((b) => b.member).map((b) => b.id), ...placements.map((p) => p.boardId)]);
}
