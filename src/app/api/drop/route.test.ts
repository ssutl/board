import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { useTestDb } from "@/lib/db/testing";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/capture/drop", () => ({ handleDrop: vi.fn(async () => ({ status: 201, body: { id: "i1", kind: "image" }, processId: "i1" })) }));

const { after } = await import("next/server");
const { rotateDropKey } = await import("@/lib/auth/dropKey");
const { POST } = await import("./route");

useTestDb();

const SECRET = "x".repeat(40);
beforeEach(() => {
  vi.stubEnv("BOARD_SECRET", SECRET);
  vi.mocked(after).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const req = (headers: Record<string, string> = {}) => {
  const body = new FormData();
  body.append("url", "https://example.com");
  return new Request("https://board.ssutl.com/api/drop", { method: "POST", body, headers });
};

describe("POST /api/drop", () => {
  it("401s without credentials or with a wrong key", async () => {
    expect((await POST(req())).status).toBe(401);
    await rotateDropKey();
    expect((await POST(req({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("accepts the Shortcut's key and schedules processing", async () => {
    const key = await rotateDropKey();
    const res = await POST(req({ authorization: `Bearer ${key}` }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "i1", kind: "image" });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("accepts the edit-side session cookie", async () => {
    const token = await createSession(SECRET);
    expect((await POST(req({ cookie: `other=1; ${SESSION_COOKIE}=${token}` }))).status).toBe(201);
  });

  it("an old key stops working after rotation", async () => {
    const old = await rotateDropKey();
    await rotateDropKey();
    expect((await POST(req({ authorization: `Bearer ${old}` }))).status).toBe(401);
  });
});
