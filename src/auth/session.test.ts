import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_STORAGE_KEY } from "./storage";
import type { AuthSession } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

const leftoverStored = {
  accessToken: "access",
  refreshToken: "refresh",
  user: {
    id: "emp-1",
    email: "emp@example.invalid",
    role: "employee",
  },
};

const publicUser = {
  id: "emp-1",
  email: "emp@example.invalid",
  roles: ["sales", "customer_service"] as const,
};

function installMemoryStorage(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  vi.stubGlobal("browser", {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: store[key] };
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
        async remove(key: string) {
          delete store[key];
        },
      },
    },
  });
  return store;
}

describe("onAuthSessionStorageChanged", () => {
  it("clears cached and popup auth state when granot-sync:auth-session-v1 is removed", async () => {
    const store = installMemoryStorage({
      [AUTH_SESSION_STORAGE_KEY]: leftoverStored,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          ok: true,
          data: { user: publicUser },
        }),
      }),
    );

    const sessionMod = await import("./session");
    const bootstrapped = await sessionMod.bootstrapAuthSession();
    expect(bootstrapped?.user.roles).toEqual(["sales", "customer_service"]);
    expect(sessionMod.getCachedAuthSession()?.user.roles).toEqual([
      "sales",
      "customer_service",
    ]);
    expect(store[AUTH_SESSION_STORAGE_KEY] as AuthSession).toMatchObject({
      user: { roles: ["sales", "customer_service"] },
    });
    expect(
      JSON.stringify(store[AUTH_SESSION_STORAGE_KEY]),
    ).not.toContain('"role"');

    const popupAuth: { session?: AuthSession } = {
      session: sessionMod.getCachedAuthSession(),
    };
    sessionMod.onAuthSessionStorageChanged(
      { [AUTH_SESSION_STORAGE_KEY]: { newValue: undefined } },
      popupAuth,
    );

    expect(sessionMod.getCachedAuthSession()).toBeUndefined();
    expect(popupAuth.session).toBeUndefined();
  });
});

describe("onDocumentVisible", () => {
  it("re-runs bootstrapAuthSession when the document becomes visible", async () => {
    const store = installMemoryStorage({
      [AUTH_SESSION_STORAGE_KEY]: leftoverStored,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          ok: true,
          data: { user: publicUser },
        }),
      }),
    );

    const sessionMod = await import("./session");
    const result = await sessionMod.onDocumentVisible();
    expect(result?.user.roles).toEqual(["sales", "customer_service"]);
    expect(sessionMod.getCachedAuthSession()?.user.email).toBe(
      "emp@example.invalid",
    );
    expect(store[AUTH_SESSION_STORAGE_KEY] as AuthSession).toMatchObject({
      user: { roles: ["sales", "customer_service"] },
    });
  });
});

describe("signOut", () => {
  it("clears stored and cached auth", async () => {
    const store = installMemoryStorage({
      [AUTH_SESSION_STORAGE_KEY]: leftoverStored,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          ok: true,
          data: { user: publicUser },
        }),
      }),
    );

    const sessionMod = await import("./session");
    await sessionMod.bootstrapAuthSession();
    expect(sessionMod.getCachedAuthSession()).toBeDefined();

    await sessionMod.signOut();

    expect(sessionMod.getCachedAuthSession()).toBeUndefined();
    expect(store[AUTH_SESSION_STORAGE_KEY]).toBeUndefined();
  });
});
