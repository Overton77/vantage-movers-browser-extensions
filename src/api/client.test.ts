import { afterEach, describe, expect, it, vi } from "vitest";

const { signOut, refreshAuthSession, getAccessToken } = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  refreshAuthSession: vi.fn().mockResolvedValue(undefined),
  getAccessToken: vi.fn().mockResolvedValue("access-token"),
}));

vi.mock("../auth/session", () => ({
  getAccessToken,
  refreshAuthSession,
  signOut,
}));

vi.mock("../config", () => ({
  VANTAGE_API_BASE: "https://api.example.test",
  VANTAGE_API_SECRET: "",
}));

afterEach(() => {
  vi.unstubAllGlobals();
  signOut.mockClear();
  refreshAuthSession.mockClear();
  getAccessToken.mockClear();
});

describe("vantageFetch", () => {
  it("signs out after a 401 when refresh cannot mint a new pair", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ ok: false, error: "Unauthorized" }),
      }),
    );

    const { vantageFetch } = await import("./client");
    await expect(vantageFetch("/api/v1/example", { method: "GET" })).rejects.toThrow(
      /401/,
    );

    expect(refreshAuthSession).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
