import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_SESSION_STORAGE_KEY,
  parseStoredAuthSession,
  persistableAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
} from "./storage";
import type { AuthSession } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseStoredAuthSession", () => {
  it("maps leftover stored role employee to Sales plus Customer Service", () => {
    const session = parseStoredAuthSession({
      accessToken: "access",
      refreshToken: "refresh",
      user: {
        id: "emp-1",
        email: "emp@example.invalid",
        role: "employee",
      },
    });

    expect(session).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      user: {
        id: "emp-1",
        email: "emp@example.invalid",
        roles: ["sales", "customer_service"],
      },
    });
    expect(session && "role" in session.user).toBe(false);
  });

  it("accepts stored roles arrays", () => {
    const session = parseStoredAuthSession({
      accessToken: "access",
      refreshToken: "refresh",
      user: {
        id: "own-1",
        email: "owner@example.invalid",
        roles: ["sales", "owner"],
      },
    });

    expect(session?.user.roles).toEqual(["owner", "sales"]);
  });

  it("rejects a session with no usable roles", () => {
    expect(
      parseStoredAuthSession({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "x", email: "x@example.invalid" },
      }),
    ).toBeUndefined();
  });
});

describe("persistableAuthSession", () => {
  it("persists roles only and never leftover role or employee", () => {
    const persisted = persistableAuthSession({
      accessToken: "access",
      refreshToken: "refresh",
      user: {
        id: "u1",
        email: "rep@example.invalid",
        roles: ["customer_service", "sales"],
      },
    });

    expect(persisted.user).toEqual({
      id: "u1",
      email: "rep@example.invalid",
      roles: ["sales", "customer_service"],
    });
    expect(persisted.user).not.toHaveProperty("role");
    expect(JSON.stringify(persisted)).not.toContain("employee");
  });
});

describe("read and write stored auth session", () => {
  it("writes the roles-only shape through browser.storage", async () => {
    const store: Record<string, unknown> = {};
    vi.stubGlobal("browser", {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: store[key] };
          },
          async set(items: Record<string, unknown>) {
            Object.assign(store, items);
          },
        },
      },
    });

    const session: AuthSession = {
      accessToken: "access",
      refreshToken: "refresh",
      user: {
        id: "u1",
        email: "rep@example.invalid",
        roles: ["sales", "customer_service"],
      },
    };

    await writeStoredAuthSession(session);
    const written = store[AUTH_SESSION_STORAGE_KEY] as AuthSession;
    expect(written.user.roles).toEqual(["sales", "customer_service"]);
    expect(written.user).not.toHaveProperty("role");

    const read = await readStoredAuthSession();
    expect(read?.user.roles).toEqual(["sales", "customer_service"]);
  });
});
