import "server-only";
import { db } from "./client";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db().query<{ value: string | null }>("select value from settings where key = $1", [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db().query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
}

/** A lease that expires on its own (a crashed run can't hold it forever). True when this caller got it. */
export async function acquireLease(name: string, ms: number): Promise<boolean> {
  const now = Date.now();
  const rows = await db().query(
    `insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value
     where settings.value is null or settings.value::bigint < $3::bigint returning key`,
    [name, String(now + ms), String(now)],
  );
  return rows.length > 0;
}

export async function releaseLease(name: string): Promise<void> {
  await db().query("update settings set value = null where key = $1", [name]);
}
