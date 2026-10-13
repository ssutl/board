import { afterEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized, dropAuthorized } from "./request";

afterEach(() => vi.unstubAllEnvs());

const req = (headers: Record<string, string> = {}) => new Request("https://board.ssutl.com/x", { headers });

describe("dropAuthorized", () => {
  it("is false (not a throw) for a malformed cookie", async () => {
    vi.stubEnv("BOARD_SECRET", "x".repeat(32));
    expect(await dropAuthorized(req({ cookie: "board_session=%E0%A4%A" }))).toBe(false);
  });

  it("is false when BOARD_SECRET is unset and there is no bearer", async () => {
    vi.stubEnv("BOARD_SECRET", "");
    expect(await dropAuthorized(req({ cookie: "board_session=abc" }))).toBe(false);
    expect(await dropAuthorized(req())).toBe(false);
  });
});

describe("cronAuthorized", () => {
  it("accepts only the exact secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(cronAuthorized(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(cronAuthorized(req({ authorization: "Bearer s3cre" }))).toBe(false);
    expect(cronAuthorized(req({ authorization: "Bearer wrong-and-longer" }))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);
  });

  it("is false when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAuthorized(req({ authorization: "Bearer x" }))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);
  });
});
