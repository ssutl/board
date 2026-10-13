import { describe, expect, it } from "vitest";
import { db } from "./client";
import { useTestDb } from "./testing";
import { fromVector, toVector } from "./vector";

useTestDb();

describe("schema", () => {
  it("creates an item with defaults and round-trips a 1536-d vector", async () => {
    const v = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const [row] = await db().query<{ id: string; status: string; attempts: number; embedding: string }>(
      "insert into items (kind, embedding) values ('image', $1::vector) returning id, status, attempts, embedding::text as embedding",
      [toVector(v)],
    );
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
    expect(fromVector(row.embedding)).toEqual(v);
  });

  it("rejects an unknown status", async () => {
    await expect(db().query("insert into items (kind, status) values ('image', 'weird')")).rejects.toThrow();
  });

  it("runs a transaction atomically", async () => {
    await expect(
      db().transaction([
        { text: "insert into settings (key, value) values ('a', '1')" },
        { text: "insert into settings (key, value) values ('a', '2')" },
      ]),
    ).rejects.toThrow();
    expect(await db().query("select * from settings")).toEqual([]);
  });
});
