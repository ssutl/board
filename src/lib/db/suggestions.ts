import "server-only";
import { db } from "./client";

export type SplitPayload = { boardId: string; groups: { itemIds: string[]; name: string; description: string }[] };
export type MergePayload = { keepId: string; dropId: string; similarity: number };
export type NewSuggestion = { type: "split"; payload: SplitPayload } | { type: "merge"; payload: MergePayload };
export type SuggestionRow = { id: string; status: "open" | "accepted" | "rejected" } & NewSuggestion;

export async function suggestionExists(fp: string): Promise<boolean> {
  return (await db().query("select 1 from suggestions where fingerprint = $1", [fp])).length > 0;
}

/** False when this exact suggestion was made before (open, accepted or rejected). */
export async function openSuggestion(s: NewSuggestion, fp: string): Promise<boolean> {
  const rows = await db().query(
    "insert into suggestions (type, payload, fingerprint) values ($1, $2::jsonb, $3) on conflict (fingerprint) do nothing returning id",
    [s.type, JSON.stringify(s.payload), fp],
  );
  return rows.length > 0;
}

export async function boardsWithOpenSuggestions(): Promise<Set<string>> {
  const rows = await db().query<{ id: string | null }>(
    `select payload->>'boardId' as id from suggestions where status = 'open'
     union select payload->>'keepId' from suggestions where status = 'open'
     union select payload->>'dropId' from suggestions where status = 'open'`,
  );
  return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
}

export async function listOpenSuggestions(): Promise<SuggestionRow[]> {
  return db().query<SuggestionRow>("select id, type, payload, status from suggestions where status = 'open' order by created_at");
}

export async function getSuggestion(id: string): Promise<SuggestionRow | null> {
  const [row] = await db().query<SuggestionRow>("select id, type, payload, status from suggestions where id = $1", [id]);
  return row ?? null;
}

export async function setSuggestionStatus(id: string, status: "accepted" | "rejected"): Promise<void> {
  await db().query("update suggestions set status = $2 where id = $1", [id, status]);
}
