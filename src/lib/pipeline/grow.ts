import "server-only";
import { nameBoard } from "@/lib/ai/gemini";
import { findNewBoards } from "@/lib/boards/grow";
import { createBoard } from "@/lib/db/boards";
import { looseItems } from "@/lib/db/items";
import { acquireLease, releaseLease } from "@/lib/db/settings";
import { isTransient } from "./process";

const LEASE = "grow_lock";

/** Forms new boards from Loose. One run at a time (lease), so overlapping runs never duplicate a board. */
export async function growBoards(): Promise<number> {
  if (!(await acquireLease(LEASE, 5 * 60_000))) return 0;
  let made = 0;
  try {
    const loose = await looseItems();
    const captions = new Map(loose.map((l) => [l.id, l.caption ?? ""]));
    for (const group of findNewBoards(loose)) {
      const { name, description } = await nameBoard(group.itemIds.map((id) => captions.get(id) ?? "").filter(Boolean));
      await createBoard({
        name,
        description,
        centroid: group.centroid,
        coverItemId: group.coverId,
        members: group.itemIds.map((itemId) => ({ itemId, similarity: group.similarities[itemId] })),
      });
      made++;
    }
    return made;
  } catch (error) {
    if (isTransient(error)) return made;
    throw error;
  } finally {
    await releaseLease(LEASE);
  }
}
