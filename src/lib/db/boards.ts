import "server-only";
import { randomUUID } from "node:crypto";
import type { Placement } from "@/lib/boards/place";
import type { BoardSummary } from "@/lib/boards/suggest";
import { slugify, uniqueSlug } from "@/lib/slug";
import { centroidOf } from "@/lib/vectors/centroid";
import { dot } from "@/lib/vectors/math";
import { db } from "./client";
import { fromVector, toVector } from "./vector";

export type PlacementBoard = { id: string; centroid: number[]; hidden: boolean; pinned: boolean; excluded: boolean; member: boolean };

const REJECT_SUGGESTIONS_FOR = `update suggestions set status = 'rejected'
  where status = 'open' and (payload->>'boardId' = $1 or payload->>'keepId' = $1 or payload->>'dropId' = $1)`;

/** Every board with this item's relationship to it. */
export async function boardsForPlacement(itemId: string): Promise<PlacementBoard[]> {
  const rows = await db().query<Omit<PlacementBoard, "centroid"> & { centroid: string }>(
    `select b.id, b.centroid::text as centroid, b.hidden,
            coalesce(bi.pinned, false) as pinned, coalesce(bi.excluded, false) as excluded,
            (bi.item_id is not null and not bi.excluded) as member
     from boards b left join board_items bi on bi.board_id = b.id and bi.item_id = $1`,
    [itemId],
  );
  return rows.map((r) => ({ ...r, centroid: fromVector(r.centroid) }));
}

/** Replaces the AI's memberships for an item; pinned and excluded rows are mine and stay. */
export async function replaceAutoMemberships(itemId: string, placements: Placement[]): Promise<void> {
  await db().transaction([
    { text: "delete from board_items where item_id = $1 and not pinned and not excluded", params: [itemId] },
    {
      text: `insert into board_items (board_id, item_id, similarity)
             select unnest($2::uuid[]), $1::uuid, unnest($3::real[]) on conflict (board_id, item_id) do nothing`,
      params: [itemId, placements.map((p) => p.boardId), placements.map((p) => p.similarity)],
    },
  ]);
}

/** Recomputes centroids and covers; a board with no members left is deleted. */
export async function recomputeBoards(boardIds: string[]): Promise<void> {
  for (const id of new Set(boardIds)) {
    const [{ count }] = await db().query<{ count: number }>(
      "select count(*)::int as count from board_items where board_id = $1 and not excluded",
      [id],
    );
    if (count === 0) {
      const noMembers = (cond: string) => `not exists (select 1 from board_items where ${cond} and not excluded)`;
      await db().transaction([
        { text: `${REJECT_SUGGESTIONS_FOR} and ${noMembers("board_id::text = $1")}`, params: [id] },
        { text: `delete from boards where id = $1 and ${noMembers("board_id = $1")}`, params: [id] },
      ]);
      continue;
    }
    const members = await db().query<{ item_id: string; embedding: string }>(
      `select bi.item_id, i.embedding::text as embedding from board_items bi join items i on i.id = bi.item_id
       where bi.board_id = $1 and not bi.excluded and i.embedding is not null`,
      [id],
    );
    if (members.length === 0) continue; // members exist but none are embedded yet: leave centroid and cover alone
    const vectors = members.map((m) => fromVector(m.embedding));
    const centroid = centroidOf(vectors);
    const [board] = await db().query<{ cover_item_id: string | null }>("select cover_item_id from boards where id = $1", [id]);
    if (!board) continue;
    let cover = board.cover_item_id;
    if (!members.some((m) => m.item_id === cover)) {
      let best = 0;
      vectors.forEach((v, k) => {
        if (dot(v, centroid) > dot(vectors[best], centroid)) best = k;
      });
      cover = members[best].item_id;
    }
    await db().query("update boards set centroid = $2::vector, cover_item_id = $3, updated_at = now() where id = $1", [id, toVector(centroid), cover]);
  }
}

export async function createBoard(p: {
  name: string;
  description: string;
  centroid: number[];
  coverItemId: string;
  members: { itemId: string; similarity: number }[];
}): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const base = slugify(p.name);
  const taken = (await db().query<{ slug: string }>("select slug from boards where slug = $1 or slug like $2", [base, `${base}-%`])).map((r) => r.slug);
  const slug = uniqueSlug(base, taken);
  await db().transaction([
    {
      text: "insert into boards (id, slug, name, description, centroid, cover_item_id) values ($1, $2, $3, $4, $5::vector, $6)",
      params: [id, slug, p.name, p.description, toVector(p.centroid), p.coverItemId],
    },
    {
      text: `insert into board_items (board_id, item_id, similarity)
             select $1::uuid, unnest($2::uuid[]), unnest($3::real[]) on conflict (board_id, item_id) do nothing`,
      params: [id, p.members.map((m) => m.itemId), p.members.map((m) => m.similarity)],
    },
  ]);
  return { id, slug };
}

export async function boardMembers(boardId: string): Promise<{ itemId: string; embedding: number[]; pinned: boolean; caption: string | null }[]> {
  const rows = await db().query<{ item_id: string; embedding: string; pinned: boolean; caption: string | null }>(
    `select bi.item_id, i.embedding::text as embedding, bi.pinned, i.caption from board_items bi join items i on i.id = bi.item_id
     where bi.board_id = $1 and not bi.excluded and i.embedding is not null order by bi.added_at`,
    [boardId],
  );
  return rows.map((r) => ({ itemId: r.item_id, embedding: fromVector(r.embedding), pinned: r.pinned, caption: r.caption }));
}

export async function boardSummaries(): Promise<(BoardSummary & { name: string; hidden: boolean })[]> {
  const rows = await db().query<{ id: string; name: string; hidden: boolean; centroid: string; size: number }>(
    `select b.id, b.name, b.hidden, b.centroid::text as centroid,
            (select count(*)::int from board_items bi where bi.board_id = b.id and not bi.excluded) as size
     from boards b order by b.created_at`,
  );
  return rows.map((r) => ({ ...r, centroid: fromVector(r.centroid) }));
}

export async function addToBoard(itemId: string, boardId: string): Promise<void> {
  await db().query(
    `insert into board_items (board_id, item_id, pinned) values ($1, $2, true)
     on conflict (board_id, item_id) do update set pinned = true, excluded = false`,
    [boardId, itemId],
  );
  await recomputeBoards([boardId]);
}

export async function removeFromBoard(itemId: string, boardId: string): Promise<void> {
  await db().query(
    `insert into board_items (board_id, item_id, excluded) values ($1, $2, true)
     on conflict (board_id, item_id) do update set excluded = true, pinned = false`,
    [boardId, itemId],
  );
  await recomputeBoards([boardId]);
}

export async function renameBoard(id: string, name: string): Promise<void> {
  await db().query("update boards set name = $2, updated_at = now() where id = $1", [id, name.trim().slice(0, 60)]);
}

export async function setBoardDescription(id: string, description: string): Promise<void> {
  await db().query("update boards set description = $2, updated_at = now() where id = $1", [id, description.trim().slice(0, 300)]);
}

export async function setBoardCover(boardId: string, itemId: string): Promise<void> {
  await db().query(
    `update boards set cover_item_id = $2 where id = $1
     and exists (select 1 from board_items where board_id = $1 and item_id = $2 and not excluded)`,
    [boardId, itemId],
  );
}

export async function setBoardHidden(id: string, hidden: boolean): Promise<void> {
  await db().query("update boards set hidden = $2 where id = $1", [id, hidden]);
}

export async function moveMembers(fromId: string, toId: string, itemIds: string[]): Promise<void> {
  if (fromId === toId) return;
  await db().transaction([
    {
      text: `insert into board_items (board_id, item_id, similarity, pinned)
             select $2::uuid, item_id, similarity, pinned from board_items
             where board_id = $1 and item_id = any($3::uuid[]) and not excluded
             on conflict (board_id, item_id) do update set pinned = board_items.pinned or excluded.pinned
             where not board_items.excluded`,
      params: [fromId, toId, itemIds],
    },
    {
      text: `delete from board_items f where f.board_id = $1 and f.item_id = any($2::uuid[]) and not f.excluded
             and exists (select 1 from board_items t where t.board_id = $3 and t.item_id = f.item_id and not t.excluded)`,
      params: [fromId, itemIds, toId],
    },
  ]);
  await recomputeBoards([fromId, toId]);
}

/** Moves the dropped board's members into the kept one (pinned carried, my exclusions respected), then deletes it. */
export async function mergeBoards(keepId: string, dropId: string): Promise<void> {
  if (keepId === dropId) return;
  await db().transaction([
    {
      text: `insert into board_items (board_id, item_id, similarity, pinned)
             select $1::uuid, item_id, similarity, pinned from board_items where board_id = $2 and not excluded
             on conflict (board_id, item_id) do update set pinned = board_items.pinned or excluded.pinned
             where not board_items.excluded`,
      params: [keepId, dropId],
    },
    {
      text: `insert into board_items (board_id, item_id, similarity, excluded)
             select $1::uuid, item_id, similarity, true from board_items where board_id = $2 and excluded
             on conflict (board_id, item_id) do nothing`,
      params: [keepId, dropId],
    },
    { text: REJECT_SUGGESTIONS_FOR, params: [dropId] },
    { text: "delete from boards where id = $1", params: [dropId] },
  ]);
  await recomputeBoards([keepId]);
}
