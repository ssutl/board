import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "@/lib/db/settings";

const KEY = "drop_key_hash";
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new Shortcut key; only its hash is stored, so this is the one time it can be shown. */
export async function rotateDropKey(): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await setSetting(KEY, hash(key));
  return key;
}

export async function verifyDropKey(key: string): Promise<boolean> {
  const stored = await getSetting(KEY);
  if (!stored || !key) return false;
  const a = Buffer.from(hash(key));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
