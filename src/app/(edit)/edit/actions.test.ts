import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));

const actions = await import("./actions");

beforeEach(() => vi.stubEnv("BOARD_SECRET", "z".repeat(40)));
afterEach(() => vi.unstubAllEnvs());

describe("edit actions", () => {
  for (const [name, fn] of Object.entries(actions)) {
    it(`${name} refuses without a session`, async () => {
      await expect((fn as (...args: unknown[]) => Promise<unknown>)("00000000-0000-0000-0000-000000000000", new FormData())).rejects.toThrow("Not logged in.");
    });
  }
});
