import type { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "@/lib/db/testing";
import { BudgetExceeded } from "@/lib/db/usage";
import { embedImage, embedQuery, isTransient, lookAt, nameBoard, setAiForTests } from "./gemini";

useTestDb();

const generateContent = vi.fn();
const embedContent = vi.fn();
beforeEach(() => {
  generateContent.mockReset();
  embedContent.mockReset();
  setAiForTests({ models: { generateContent, embedContent } } as unknown as GoogleGenAI);
});
afterEach(() => setAiForTests(null));

const unit1536 = () => Array.from({ length: 1536 }, (_, i) => (i === 0 ? 2 : 0));

describe("gemini wrapper", () => {
  it("lookAt sends the image and parses the JSON reply", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ box: null, caption: "A lamp" }) });
    const look = await lookAt(Buffer.from([0xff, 0xd8, 0xff]));
    expect(look.caption).toBe("A lamp");
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].inlineData.mimeType).toBe("image/jpeg");
  });

  it("embedImage embeds image + caption as one content and normalises", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: unit1536() }] });
    const v = await embedImage(Buffer.from([1]), "A lamp");
    expect(v[0]).toBe(1);
    const req = embedContent.mock.calls[0][0];
    expect(req.contents).toHaveLength(1);
    expect(req.contents[0].parts[1].text).toBe("title: none | text: A lamp");
    expect(req.config.outputDimensionality).toBe(1536);
  });

  it("embedImage rejects the wrong shape", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 2, 3] }] });
    await expect(embedImage(Buffer.from([1]), "x")).rejects.toThrow(/shape/);
  });

  it("embedQuery caches repeated queries", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: unit1536() }] });
    await embedQuery("Olive Workwear");
    await embedQuery("olive workwear ");
    expect(embedContent).toHaveBeenCalledTimes(1);
  });

  it("nameBoard returns a validated name", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ name: "Analog 80s", description: "Boxy, red and chrome." }) });
    expect(await nameBoard(["a red car", "a chrome hifi"])).toEqual({ name: "Analog 80s", description: "Boxy, red and chrome." });
  });

  it("nameBoard cuts over-long replies instead of rejecting them", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ name: "n".repeat(60), description: "d".repeat(300) }) });
    expect(await nameBoard(["x"])).toEqual({ name: "n".repeat(40), description: "d".repeat(200) });
  });

  it("isTransient: the daily budget and rate limits, not other errors", () => {
    expect(isTransient(new BudgetExceeded("search"))).toBe(true);
    expect(isTransient(Object.assign(new Error("{}"), { status: 429 }))).toBe(true);
    expect(isTransient(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
    expect(isTransient(new SyntaxError("bad json"))).toBe(false);
  });
});
