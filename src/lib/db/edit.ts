import "server-only";
import { db } from "./client";
import type { ItemRow } from "./items";

export type EditThumb = { id: string; image_url: string | null; width: number | null; height: number | null; caption: string | null; hidden: boolean; status: string };
const THUMB = "i.id, coalesce(i.image_url, i.original_url) as image_url, i.width, i.height, i.caption, i.hidden, i.status";
const LOOSE = "not exists (select 1 from board_items bi where bi.item_id = i.id and not bi.excluded)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function editBadges(): Promise<{ inbox: number; loose: number; suggestions: number }> {
  const [row] = await db().query<{ inbox: number; loose: number; suggestions: number }>(
    `select (select count(*)::int from items where status in ('pending', 'processing', 'failed')) as inbox,
            (select count(*)::int from items i where i.status = 'ready' and ${LOOSE}) as loose,
            (select count(*)::int from suggestions where status = 'open') as suggestions`,
  );
  return row;
}

export async function listInbox() {
  return db().query<{ id: string; status: string; attempts: number; error: string | null; original_url: string | null; source_url: string | null }>(
    "select id, status, attempts, error, original_url, source_url from items where status in ('pending', 'processing', 'failed') order by created_at desc",
  );
}

export async function listLooseForEdit() {
  const [images, links] = await Promise.all([
    db().query<EditThumb>(`select ${THUMB} from items i where i.status = 'ready' and i.kind = 'image' and ${LOOSE} order by i.created_at desc`),
    db().query<{ id: string; source_url: string; title: string | null; blocked_source: boolean }>(
      "select id, source_url, title, blocked_source from items where kind = 'link' order by created_at desc",
    ),
  ]);
  return { images, links };
}

export async function listBoardsForEdit() {
  return db().query<{ id: string; slug: string; name: string; hidden: boolean; count: number; cover_url: string | null }>(
    `select b.id, b.slug, b.name, b.hidden,
            (select count(*)::int from board_items bi where bi.board_id = b.id and not bi.excluded) as count,
            (select i.image_url from items i where i.id = b.cover_item_id) as cover_url
     from boards b order by b.updated_at desc`,
  );
}

export async function boardForEdit(id: string) {
  if (!UUID.test(id)) return null;
  const [board] = await db().query<{ id: string; slug: string; name: string; description: string; hidden: boolean; cover_item_id: string | null }>(
    "select id, slug, name, description, hidden, cover_item_id from boards where id = $1",
    [id],
  );
  if (!board) return null;
  const items = await db().query<EditThumb & { pinned: boolean }>(
    `select ${THUMB}, bi.pinned from board_items bi join items i on i.id = bi.item_id
     where bi.board_id = $1 and not bi.excluded order by i.created_at desc`,
    [id],
  );
  return { board, items };
}

export async function itemForEdit(id: string) {
  if (!UUID.test(id)) return null;
  const [item] = await db().query<ItemRow>(
    "select id, kind, status, attempts, error, original_url, image_url, uncropped_url, width, height, use_crop, source_url, title, caption, tags, hidden, blocked_source from items where id = $1",
    [id],
  );
  if (!item) return null;
  const boards = await db().query<{ id: string; slug: string; name: string; pinned: boolean; excluded: boolean }>(
    "select b.id, b.slug, b.name, bi.pinned, bi.excluded from board_items bi join boards b on b.id = bi.board_id where bi.item_id = $1 order by b.name",
    [id],
  );
  return { item, boards };
}

export async function boardOptions() {
  return db().query<{ id: string; name: string }>("select id, name from boards order by name");
}

export async function thumbsFor(ids: string[]): Promise<EditThumb[]> {
  if (ids.length === 0) return [];
  return db().query<EditThumb>(`select ${THUMB} from items i where i.id = any($1::uuid[])`, [ids]);
}
