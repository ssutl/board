import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { DIMENSIONS } from "@/lib/config";
import { normalize } from "@/lib/vectors/math";
import { db, setDb, type Db } from "./client";
import { toVector } from "./vector";

const TABLES = "board_items, suggestions, boards, items, ai_usage, settings";

/** One in-memory Postgres (with pgvector) per test file, emptied before every test. */
export function useTestDb(): void {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite({ extensions: { vector } });
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await pg.exec(readFileSync(path.join(dir, file), "utf8"));
    }
    const wrapped: Db = {
      query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
      transaction: async (statements) => {
        await pg.transaction(async (tx) => {
          for (const s of statements) await tx.query(s.text, s.params ?? []);
        });
      },
    };
    setDb(wrapped);
  });
  beforeEach(async () => {
    await pg.exec(`truncate ${TABLES} cascade`);
  });
  afterAll(async () => {
    setDb(null);
    await pg.close();
  });
}

/** A 1536-d unit vector along axis i, optionally tilted toward other axes. */
export function axis(i: number, tilt: Record<number, number> = {}): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  v[i] = 1;
  for (const [k, w] of Object.entries(tilt)) v[Number(k)] += w;
  return normalize(v);
}

export async function insertTestItem({
  embedding = null,
  status = "ready",
  kind = "image",
  hidden = false,
  caption = "test item",
  imageUrl = "https://x.public.blob.vercel-storage.com/a.jpg",
  palette = [],
  createdAt = null,
}: { embedding?: number[] | null; status?: string; kind?: string; hidden?: boolean; caption?: string; imageUrl?: string; palette?: string[]; createdAt?: string | null } = {}): Promise<string> {
  const [row] = await db().query<{ id: string }>(
    `insert into items (kind, status, hidden, caption, image_url, width, height, embedding, tags, created_at)
     values ($1, $2, $3, $4, $5, 600, 800, $6::vector, $7::jsonb, coalesce($8::timestamptz, now())) returning id`,
    [kind, status, hidden, caption, imageUrl, embedding ? toVector(embedding) : null, JSON.stringify({ palette }), createdAt],
  );
  return row.id;
}
