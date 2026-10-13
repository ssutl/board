import "server-only";
import { isTransient, nameBoard } from "@/lib/ai/gemini";
import { findMerges, findSplit, fingerprint } from "@/lib/boards/suggest";
import { MIN_SPLIT_BOARD } from "@/lib/config";
import { boardMembers, boardSummaries, createBoard, findBoard, mergeBoards, moveMembers, renameBoard, setBoardDescription } from "@/lib/db/boards";
import { acquireLease, releaseLease } from "@/lib/db/settings";
import { boardsWithOpenSuggestions, getSuggestion, openSuggestion, setSuggestionStatus, suggestionExists } from "@/lib/db/suggestions";
import { centroidOf } from "@/lib/vectors/centroid";

const LEASE = "suggest_lock";

/** Nightly: proposes splits and merges. One open suggestion per board; a rejected one never reopens. */
export async function runSuggestions(): Promise<number> {
  if (!(await acquireLease(LEASE, 10 * 60_000))) return 0;
  let opened = 0;
  try {
    const boards = (await boardSummaries()).filter((b) => !b.hidden);
    const busy = await boardsWithOpenSuggestions();

    for (const b of boards) {
      if (busy.has(b.id) || b.size < MIN_SPLIT_BOARD) continue;
      try {
        const members = await boardMembers(b.id);
        const split = findSplit(members.map((m) => ({ id: m.itemId, embedding: m.embedding })));
        if (!split) continue;
        const fp = fingerprint("split", [b.id, ...members.map((m) => m.itemId)]);
        if (await suggestionExists(fp)) continue;
        const captions = new Map(members.map((m) => [m.itemId, m.caption ?? ""]));
        const groups = [];
        for (const itemIds of split.groups) {
          const named = await nameBoard(itemIds.map((id) => captions.get(id) ?? "").filter(Boolean));
          groups.push({ itemIds, ...named });
        }
        if (await openSuggestion({ type: "split", payload: { boardId: b.id, groups } }, fp)) {
          opened++;
          busy.add(b.id);
        }
      } catch (error) {
        if (isTransient(error)) break; // out of budget or rate limited: stop splitting, still look for merges
        console.warn(`split suggestion for board ${b.id} skipped`, error);
      }
    }

    for (const m of findMerges(boards.filter((b) => !busy.has(b.id)))) {
      const ids = [m.keepId, m.dropId, ...(await boardMembers(m.keepId)).map((x) => x.itemId), ...(await boardMembers(m.dropId)).map((x) => x.itemId)];
      if (await openSuggestion({ type: "merge", payload: m }, fingerprint("merge", ids))) opened++;
    }
    return opened;
  } catch (error) {
    if (isTransient(error)) return opened;
    throw error;
  } finally {
    await releaseLease(LEASE);
  }
}

export async function acceptSuggestion(id: string): Promise<void> {
  const s = await getSuggestion(id);
  if (!s || s.status !== "open") throw new Error("That suggestion is no longer open.");
  if (s.type === "merge") {
    await mergeBoards(s.payload.keepId, s.payload.dropId);
  } else {
    const { boardId, groups } = s.payload;
    const [keep, move] = groups;
    const source = await findBoard(boardId);
    if (!source) throw new Error("That board no longer exists.");
    const members = await boardMembers(boardId);
    const moving = members.filter((m) => move.itemIds.includes(m.itemId));
    if (moving.length === 0) throw new Error("Nothing left to split off.");
    await renameBoard(boardId, keep.name);
    await setBoardDescription(boardId, keep.description);
    const created = await createBoard({
      name: move.name,
      description: move.description,
      centroid: centroidOf(moving.map((m) => m.embedding)),
      coverItemId: moving[0].itemId,
      members: [],
      hidden: source.hidden, // a split of a hidden board stays hidden
    });
    await moveMembers(boardId, created.id, moving.map((m) => m.itemId));
  }
  await setSuggestionStatus(id, "accepted");
}

export async function rejectSuggestion(id: string): Promise<void> {
  await setSuggestionStatus(id, "rejected");
}
