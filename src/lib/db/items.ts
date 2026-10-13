import "server-only";
import type { Tags } from "@/lib/ai/look";
import { MAX_ATTEMPTS, STALE_CLAIM_MINUTES } from "@/lib/config";
import { db } from "./client";
import { fromVector, toVector } from "./vector";

export type ItemRow = {
  id: string;
  kind: "image" | "link";
  status: "pending" | "processing" | "ready" | "failed";
  attempts: number;
  error: string | null;
  original_url: string | null;
  image_url: string | null;
  uncropped_url: string | null;
  width: number | null;
  height: number | null;
  use_crop: boolean;
  source_url: string | null;
  title: string | null;
  caption: string | null;
  tags: Partial<Tags>;
  hidden: boolean;
  blocked_source: boolean;
};

const COLUMNS =
  "id, kind, status, attempts, error, original_url, image_url, uncropped_url, width, height, use_crop, source_url, title, caption, tags, hidden, blocked_source";

/** Pending, failed with attempts left, or stuck in processing past the stale window. */
const CLAIMABLE = `kind = 'image' and (status = 'pending' or (status = 'failed' and attempts < ${MAX_ATTEMPTS}) or (status = 'processing' and claimed_at < now() - interval '${STALE_CLAIM_MINUTES} minutes'))`;

export async function insertImageItem({
  contentHash,
  originalUrl,
  sourceUrl = null,
  title = null,
}: {
  contentHash: string;
  originalUrl: string;
  sourceUrl?: string | null;
  title?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const inserted = await db().query<{ id: string }>(
    "insert into items (kind, content_hash, original_url, source_url, title) values ('image', $1, $2, $3, $4) on conflict (content_hash) do nothing returning id",
    [contentHash, originalUrl, sourceUrl, title],
  );
  if (inserted.length) return { id: inserted[0].id, created: true };
  const id = await findIdByHash(contentHash);
  if (!id) throw new Error("Item vanished while deduplicating.");
  return { id, created: false };
}

export async function findIdByHash(hash: string): Promise<string | null> {
  const [row] = await db().query<{ id: string }>("select id from items where content_hash = $1", [hash]);
  return row?.id ?? null;
}

export async function insertLinkItem({ sourceUrl, title, blocked }: { sourceUrl: string; title: string | null; blocked: boolean }): Promise<string> {
  const [row] = await db().query<{ id: string }>(
    "insert into items (kind, status, source_url, title, blocked_source) values ('link', 'ready', $1, $2, $3) returning id",
    [sourceUrl, title, blocked],
  );
  return row.id;
}

export async function claimItem(id: string): Promise<ItemRow | null> {
  const [row] = await db().query<ItemRow>(
    `update items set status = 'processing', claimed_at = now() where id = $1 and ${CLAIMABLE} returning ${COLUMNS}`,
    [id],
  );
  return row ?? null;
}

export async function claimableIds(limit: number): Promise<string[]> {
  return (await db().query<{ id: string }>(`select id from items where ${CLAIMABLE} order by created_at limit $1`, [limit])).map((r) => r.id);
}

export async function saveProcessed(
  id: string,
  p: { imageUrl: string; uncroppedUrl: string; width: number; height: number; caption: string; tags: Tags; embedding: number[] },
): Promise<void> {
  await db().query(
    `update items set image_url = $2, uncropped_url = $3, width = $4, height = $5, caption = $6, tags = $7::jsonb, embedding = $8::vector where id = $1`,
    [id, p.imageUrl, p.uncroppedUrl, p.width, p.height, p.caption, JSON.stringify(p.tags), toVector(p.embedding)],
  );
}

export async function markReady(id: string): Promise<void> {
  await db().query("update items set status = 'ready', error = null, claimed_at = null where id = $1", [id]);
}

export async function markFailed(id: string, error: string): Promise<void> {
  await db().query("update items set status = 'failed', attempts = attempts + 1, error = $2, claimed_at = null where id = $1", [id, error.slice(0, 500)]);
}

export async function releaseClaim(id: string): Promise<void> {
  await db().query("update items set status = 'pending', claimed_at = null where id = $1", [id]);
}

export async function getItem(id: string): Promise<ItemRow | null> {
  const [row] = await db().query<ItemRow>(`select ${COLUMNS} from items where id = $1`, [id]);
  return row ?? null;
}

export async function looseItems(): Promise<{ id: string; embedding: number[]; caption: string | null }[]> {
  const rows = await db().query<{ id: string; embedding: string; caption: string | null }>(
    `select i.id, i.embedding::text as embedding, i.caption from items i
     where i.status = 'ready' and i.kind = 'image' and i.embedding is not null
       and not exists (select 1 from board_items bi where bi.item_id = i.id and not bi.excluded)
     order by i.created_at`,
  );
  return rows.map((r) => ({ ...r, embedding: fromVector(r.embedding) }));
}

export async function setItemHidden(id: string, hidden: boolean): Promise<void> {
  await db().query("update items set hidden = $2 where id = $1", [id, hidden]);
}

/** Deletes the row (memberships cascade); returns the Blob files and boards to clean up after. */
export async function deleteItem(id: string): Promise<{ files: string[]; boardIds: string[] } | null> {
  const [item] = await db().query<{ original_url: string | null; image_url: string | null; uncropped_url: string | null }>(
    "select original_url, image_url, uncropped_url from items where id = $1",
    [id],
  );
  if (!item) return null;
  const boardIds = (await db().query<{ board_id: string }>("select board_id from board_items where item_id = $1", [id])).map((r) => r.board_id);
  await db().query("delete from items where id = $1", [id]);
  const files = [...new Set([item.original_url, item.image_url, item.uncropped_url].filter((u): u is string => !!u))];
  return { files, boardIds };
}

export async function resetForReprocess(id: string, { useCrop }: { useCrop?: boolean } = {}): Promise<void> {
  await db().query(
    "update items set status = 'pending', attempts = 0, error = null, claimed_at = null, use_crop = coalesce($2, use_crop) where id = $1 and kind = 'image'",
    [id, useCrop ?? null],
  );
}
