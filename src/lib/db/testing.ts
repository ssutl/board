import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { setDb, type Db } from "./client";

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
