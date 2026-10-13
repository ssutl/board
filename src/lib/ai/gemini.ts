import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { DIMENSIONS } from "@/lib/config";
import { spendCalls } from "@/lib/db/usage";
import { normalize } from "@/lib/vectors/math";
import { LOOK_PROMPT, parseLook, type Look } from "./look";

export const VISION_MODEL = "gemini-2.5-flash";
export const EMBEDDING_MODEL = "gemini-embedding-2";
// gemini-embedding-2 takes no task_type: task hints go in the text (as Reads does).
export const DOCUMENT_PREFIX = "title: none | text: ";
export const QUERY_PREFIX = "task: search result | query: ";
const JSON_CONFIG = { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } as const;
const QUERY_CACHE_SIZE = 200;

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export function setAiForTests(fake: GoogleGenAI | null): void {
  client = fake;
  queryCache.clear();
}

const image = (jpeg: Buffer) => ({ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } });

export async function lookAt(jpeg: Buffer): Promise<Look> {
  await spendCalls("pipeline");
  const res = await ai().models.generateContent({
    model: VISION_MODEL,
    contents: [{ role: "user", parts: [image(jpeg), { text: LOOK_PROMPT }] }],
    config: JSON_CONFIG,
  });
  return parseLook(res.text ?? "");
}

function checked(values: number[] | undefined): number[] {
  if (!values || values.length !== DIMENSIONS) throw new Error("Gemini returned an unexpected embedding shape.");
  return normalize(values);
}

/** One embedding for the picture and its caption together (one Content → one vector). */
export async function embedImage(jpeg: Buffer, caption: string): Promise<number[]> {
  await spendCalls("pipeline");
  const res = await ai().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [image(jpeg), { text: `${DOCUMENT_PREFIX}${caption}` }] }],
    config: { outputDimensionality: DIMENSIONS },
  });
  return checked(res.embeddings?.[0]?.values);
}

const queryCache = new Map<string, number[]>();

export async function embedQuery(query: string): Promise<number[]> {
  const key = query.trim().toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;
  await spendCalls("search");
  const res = await ai().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text: `${QUERY_PREFIX}${key}` }] }],
    config: { outputDimensionality: DIMENSIONS },
  });
  const vector = checked(res.embeddings?.[0]?.values);
  queryCache.set(key, vector);
  if (queryCache.size > QUERY_CACHE_SIZE) queryCache.delete(queryCache.keys().next().value!);
  return vector;
}

const RETRY_DELAY_RE = /"retryDelay"\s*:\s*"([\d.]+)s"/;
const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
const MAX_RATE_LIMIT_DELAY_MS = 65_000;

/**
 * null unless `error` is a Gemini rate-limit (429) or "overloaded" (503) error; otherwise how
 * long to wait before retrying, in ms — the RetryInfo `retryDelay` from the error plus a second
 * of slack, defaulting to 30s when absent and capped at 65s.
 *
 * `@google/genai`'s `throwErrorIfNotOK` (dist/node/index.{cjs,mjs} and the web build — same
 * generated code in all three) throws `new ApiError({ status: response.status, message:
 * JSON.stringify(errorBody) })`, where `errorBody` is the raw Gemini API error JSON (or a
 * synthesized `{error:{message,code,status}}` when the response wasn't JSON at all). A 429's
 * `errorBody.error.details` includes a `google.rpc.RetryInfo` entry with `retryDelay`
 * alongside other detail objects (e.g. `google.rpc.Help`), so the regex below matches on the
 * key anywhere in the stringified body rather than assuming its position or that it's the
 * only detail present.
 */
export function rateLimitDelayMs(error: unknown): number | null {
  const looksLikeGeminiError = error instanceof ApiError || (typeof error === "object" && error !== null && "status" in error);
  if (!looksLikeGeminiError) return null;

  const { status } = error as { status?: unknown };
  if (typeof status !== "number") return null;

  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? "");
  const isRateLimited = status === 429 || (status === 503 && /overloaded/i.test(message));
  if (!isRateLimited) return null;

  const retryDelay = RETRY_DELAY_RE.exec(message)?.[1];
  if (retryDelay === undefined) return DEFAULT_RATE_LIMIT_DELAY_MS;
  return Math.min(Number(retryDelay) * 1000 + 1000, MAX_RATE_LIMIT_DELAY_MS);
}

const cut = (max: number) => z.string().transform((v) => v.trim().slice(0, max).trim()).pipe(z.string().min(1));
const BoardName = z.object({ name: cut(40), description: cut(200) });

export async function nameBoard(captions: string[]): Promise<z.infer<typeof BoardName>> {
  await spendCalls("pipeline");
  const prompt = [
    "These saved images were grouped together because they look and feel alike. Their captions:",
    ...captions.slice(0, 20).map((c, i) => `${i + 1}. ${c}`),
    "",
    'Name the moodboard they make: 2 to 4 words, evocative but plain (e.g. "Analog 80s", "Japanese workwear", "Brushed aluminium").',
    'Reply with JSON only: {"name": "...", "description": "one sentence on what ties them together"}.',
  ].join("\n");
  const res = await ai().models.generateContent({ model: VISION_MODEL, contents: prompt, config: JSON_CONFIG });
  return BoardName.parse(JSON.parse(res.text ?? ""));
}
