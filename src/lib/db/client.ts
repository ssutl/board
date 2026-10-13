import "server-only";
import { neon } from "@neondatabase/serverless";

export type Statement = { text: string; params?: unknown[] };

/** The only way code talks to Postgres. Neon in production, PGlite in tests (see testing.ts). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs the statements in one transaction: all or nothing. */
  transaction(statements: Statement[]): Promise<void>;
}

let current: Db | null = null;

export function db(): Db {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    const sql = neon(url);
    current = {
      query: async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
      transaction: async (statements) => {
        await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])));
      },
    };
  }
  return current;
}

export function setDb(d: Db | null): void {
  current = d;
}
