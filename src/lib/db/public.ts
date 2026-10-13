import "server-only";
import type { Tags } from "@/lib/ai/look";
import { db } from "./client";
import { toVector } from "./vector";

/**
 * THE visibility rule: an item is public through a membership that isn't excluded, on a board
 * that isn't hidden, when the item is a ready, unhidden image. Every public read goes through this.
 */
export const PUBLIC_MEMBERSHIPS = `select bi.item_id, bi.board_id from board_items bi
  join items i on i.id = bi.item_id
  join boards b on b.id = bi.board_id
  where not bi.excluded and not b.hidden and i.status = 'ready' and i.kind = 'image' and not i.hidden and i.image_url is not null`;

export type PublicItem = { id: string; image_url: string; width: number; height: number; caption: string | null };
export type PublicItemDetail = PublicItem & { title: string | null; source_url: string | null; tags: Partial<Tags> };
export type BoardCardData = { id: string; slug: string; name: string; count: number; images: string[] };
export type PublicBoard = { id: string; slug: string; name: string; description: string; coverUrl: string | null };

const ITEM = "i.id, i.image_url, i.width, i.height, i.caption";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listPublicBoards(): Promise<BoardCardData[]> {
  const rows = await db().query<{ id: string; slug: string; name: string; count: number; cover: string | null; recent: string[] | null }>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select b.id, b.slug, b.name, count(*)::int as count,
       (select i2.image_url from pm p2 join items i2 on i2.id = p2.item_id where p2.board_id = b.id and p2.item_id = b.cover_item_id) as cover,
       (select array_agg(x.image_url) from (
          select i3.image_url from pm p3 join items i3 on i3.id = p3.item_id
          where p3.board_id = b.id and i3.id is distinct from b.cover_item_id order by i3.created_at desc limit 3) x) as recent,
       max(i.created_at) as latest
     from boards b join pm on pm.board_id = b.id join items i on i.id = pm.item_id
     group by b.id order by latest desc`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    count: r.count,
    images: [r.cover, ...(r.recent ?? [])].filter((u): u is string => !!u).slice(0, 3),
  }));
}

export async function getPublicBoard(slug: string): Promise<PublicBoard | null> {
  const [row] = await db().query<PublicBoard>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select b.id, b.slug, b.name, b.description,
       coalesce(
         (select i.image_url from pm join items i on i.id = pm.item_id where pm.board_id = b.id and pm.item_id = b.cover_item_id),
         (select i.image_url from pm join items i on i.id = pm.item_id where pm.board_id = b.id order by i.created_at desc limit 1)
       ) as "coverUrl"
     from boards b where b.slug = $1 and exists (select 1 from pm where pm.board_id = b.id)`,
    [slug],
  );
  return row ?? null;
}

export async function boardItems(boardId: string, colour: string | null = null): Promise<PublicItem[]> {
  return db().query<PublicItem>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select ${ITEM} from pm join items i on i.id = pm.item_id
     where pm.board_id = $1 and ($2::text is null or i.tags->'palette' ? $2::text)
     order by i.created_at desc`,
    [boardId, colour],
  );
}

export async function boardPalette(boardId: string): Promise<{ colour: string; count: number }[]> {
  return db().query<{ colour: string; count: number }>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select c as colour, count(*)::int as count
     from pm join items i on i.id = pm.item_id, jsonb_array_elements_text(coalesce(i.tags->'palette', '[]'::jsonb)) as c
     where pm.board_id = $1 group by c order by count desc, c`,
    [boardId],
  );
}

export async function getPublicItem(id: string): Promise<PublicItemDetail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db().query<PublicItemDetail>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select ${ITEM}, i.title, i.source_url, i.tags from items i
     where i.id = $1 and exists (select 1 from pm where pm.item_id = i.id)`,
    [id],
  );
  return row ?? null;
}

export async function boardsForItem(id: string): Promise<{ slug: string; name: string }[]> {
  if (!UUID.test(id)) return [];
  return db().query<{ slug: string; name: string }>(
    `with pm as (${PUBLIC_MEMBERSHIPS})
     select b.slug, b.name from pm join boards b on b.id = pm.board_id where pm.item_id = $1 order by b.name`,
    [id],
  );
}

export async function similarPublicItems(id: string, limit = 12): Promise<PublicItem[]> {
  if (!UUID.test(id)) return [];
  return db().query<PublicItem>(
    `with pm as (${PUBLIC_MEMBERSHIPS}), pub as (select distinct item_id from pm)
     select ${ITEM} from items i join pub on pub.item_id = i.id
     where i.id <> $1 and i.embedding is not null and exists (select 1 from pm where pm.item_id = $1)
     order by i.embedding <=> (select embedding from items where id = $1) limit $2`,
    [id, limit],
  );
}

export async function searchPublic(vector: number[]): Promise<{ items: PublicItem[]; boards: { slug: string; name: string }[] }> {
  const v = toVector(vector);
  const [items, boards] = await Promise.all([
    db().query<PublicItem>(
      `with pm as (${PUBLIC_MEMBERSHIPS}), pub as (select distinct item_id from pm)
       select ${ITEM} from items i join pub on pub.item_id = i.id where i.embedding is not null
       order by i.embedding <=> $1::vector limit 48`,
      [v],
    ),
    db().query<{ slug: string; name: string }>(
      `with pm as (${PUBLIC_MEMBERSHIPS})
       select b.slug, b.name from boards b where exists (select 1 from pm where pm.board_id = b.id)
       order by b.centroid <=> $1::vector limit 3`,
      [v],
    ),
  ]);
  return { items, boards };
}
