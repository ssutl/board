import "server-only";
import { embedImage, lookAt, rateLimitDelayMs } from "@/lib/ai/gemini";
import { placeItem } from "@/lib/boards/place";
import { MAX_BOARDS_PER_ITEM } from "@/lib/config";
import { boardsForPlacement, recomputeBoards, replaceAutoMemberships } from "@/lib/db/boards";
import { claimItem, markFailed, markReady, releaseClaim, saveProcessed } from "@/lib/db/items";
import { BudgetExceeded } from "@/lib/db/usage";
import { cropRect, normalizeImage, renderVariants } from "@/lib/images/crop";
import { deleteFiles, download, putImage } from "@/lib/storage";

export type ProcessOutcome = "ready" | "failed" | "deferred" | "skipped";

/** Errors that mean "try again later" rather than "this item is broken". */
export const isTransient = (error: unknown) => error instanceof BudgetExceeded || rateLimitDelayMs(error) !== null;

/** Look → crop → store → embed → place. Safe to call twice: only the run that claims the item works on it. */
export async function processItem(id: string): Promise<ProcessOutcome> {
  const item = await claimItem(id);
  if (!item) return "skipped";
  try {
    if (!item.original_url) throw new Error("Item has no original image.");
    const normal = await normalizeImage(await download(item.original_url));
    const look = await lookAt(normal.bytes);
    const rect = item.use_crop ? cropRect(look.box, normal.width, normal.height) : null;
    const { shown, uncropped } = await renderVariants(normal.bytes, rect);
    const stamp = Date.now();
    const imageUrl = await putImage(`items/${id}/shown-${stamp}.jpg`, shown.bytes, "image/jpeg");
    const uncroppedUrl = shown === uncropped ? imageUrl : await putImage(`items/${id}/full-${stamp}.jpg`, uncropped.bytes, "image/jpeg");
    const embedding = await embedImage(shown.bytes, look.caption);
    await saveProcessed(id, { imageUrl, uncroppedUrl, width: shown.width, height: shown.height, caption: look.caption, tags: look.tags, embedding });
    await placeOnBoards(id, embedding);
    await markReady(id);
    const stale = [item.image_url, item.uncropped_url].filter((u): u is string => !!u && u !== imageUrl && u !== uncroppedUrl);
    if (stale.length) await deleteFiles(stale).catch((e) => console.warn("could not delete old files", e));
    return "ready";
  } catch (error) {
    if (isTransient(error)) {
      await releaseClaim(id);
      return "deferred";
    }
    console.error(`processItem ${id}`, error);
    await markFailed(id, error instanceof Error ? error.message : String(error));
    return "failed";
  }
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
