import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline/sweep", () => ({ sweep: vi.fn(async () => ({ ready: 0, failed: 0, deferred: 0, skipped: 0, boards: 0, timedOut: 0 })) }));
vi.mock("@/lib/pipeline/suggest", () => ({ runSuggestions: vi.fn(async () => 2) }));

const sweepRoute = await import("./sweep/route");
const suggestRoute = await import("./suggest/route");

beforeEach(() => vi.stubEnv("CRON_SECRET", "s3cret"));
afterEach(() => vi.unstubAllEnvs());

const req = (auth?: string) => new Request("https://board.ssutl.com/api/cron/x", { headers: auth ? { authorization: auth } : {} });

describe("cron routes", () => {
  it("401 without the cron secret", async () => {
    expect((await sweepRoute.GET(req())).status).toBe(401);
    expect((await suggestRoute.GET(req("Bearer wrong"))).status).toBe(401);
  });

  it("runs with the cron secret", async () => {
    expect((await sweepRoute.GET(req("Bearer s3cret"))).status).toBe(200);
    expect(await (await suggestRoute.GET(req("Bearer s3cret"))).json()).toEqual({ opened: 2 });
  });

  it("401 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await sweepRoute.GET(req("Bearer "))).status).toBe(401);
  });
});
