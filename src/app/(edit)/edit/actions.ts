"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { rotateDropKey } from "@/lib/auth/dropKey";
import { requireSession } from "@/lib/auth/requireSession";
import {
  addToBoard, recomputeBoards, removeFromBoard, renameBoard, setBoardCover, setBoardDescription, setBoardHidden,
} from "@/lib/db/boards";
import { deleteItem, resetForReprocess, setItemHidden } from "@/lib/db/items";
import { growBoards } from "@/lib/pipeline/grow";
import { processItem } from "@/lib/pipeline/process";
import { acceptSuggestion, rejectSuggestion } from "@/lib/pipeline/suggest";
import { deleteFiles } from "@/lib/storage";

/** Every action: session first, then the work, then refresh everything that might show it. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  await requireSession();
  const result = await work();
  revalidatePath("/", "layout");
  return result;
}

const reprocess = (id: string) =>
  after(async () => {
    await processItem(id);
    await growBoards();
  });

export async function retryItem(id: string): Promise<void> {
  await guarded(async () => {
    if (await resetForReprocess(id)) reprocess(id);
  });
}

export async function useOriginalImage(id: string): Promise<void> {
  await guarded(async () => {
    if (await resetForReprocess(id, { useCrop: false })) reprocess(id);
  });
}

export async function setItemHiddenAction(id: string, hidden: boolean): Promise<void> {
  await guarded(() => setItemHidden(id, hidden));
}

export async function deleteItemAction(id: string): Promise<void> {
  await guarded(async () => {
    const gone = await deleteItem(id);
    if (!gone) return;
    await deleteFiles(gone.files).catch((e) => console.warn("could not delete files", e));
    await recomputeBoards(gone.boardIds);
  });
  redirect("/edit/loose");
}

export async function addItemToBoard(itemId: string, form: FormData): Promise<void> {
  const boardId = String(form.get("boardId") ?? "");
  await guarded(async () => {
    if (boardId) await addToBoard(itemId, boardId);
  });
}

export async function removeItemFromBoard(itemId: string, boardId: string): Promise<void> {
  await guarded(() => removeFromBoard(itemId, boardId));
}

export async function renameBoardAction(boardId: string, form: FormData): Promise<void> {
  const name = String(form.get("name") ?? "").trim();
  await guarded(async () => {
    if (name) await renameBoard(boardId, name);
  });
}

export async function describeBoardAction(boardId: string, form: FormData): Promise<void> {
  await guarded(() => setBoardDescription(boardId, String(form.get("description") ?? "")));
}

export async function setCoverAction(boardId: string, itemId: string): Promise<void> {
  await guarded(() => setBoardCover(boardId, itemId));
}

export async function setBoardHiddenAction(boardId: string, hidden: boolean): Promise<void> {
  await guarded(() => setBoardHidden(boardId, hidden));
}

export async function acceptSuggestionAction(id: string): Promise<void> {
  await guarded(() => acceptSuggestion(id));
}

export async function rejectSuggestionAction(id: string): Promise<void> {
  await guarded(() => rejectSuggestion(id));
}

export async function rotateDropKeyAction(): Promise<string> {
  return guarded(() => rotateDropKey());
}
