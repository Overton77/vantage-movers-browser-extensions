import { toPublicExtensionUser } from "./roles";
import type { AuthSession } from "./types";

export const AUTH_SESSION_STORAGE_KEY = "granot-sync:auth-session-v1";

export async function readStoredAuthSession(): Promise<AuthSession | undefined> {
  const stored = await browser.storage.local.get(AUTH_SESSION_STORAGE_KEY);
  return parseStoredAuthSession(stored?.[AUTH_SESSION_STORAGE_KEY]);
}

export async function writeStoredAuthSession(session: AuthSession): Promise<void> {
  await browser.storage.local.set({
    [AUTH_SESSION_STORAGE_KEY]: persistableAuthSession(session),
  });
}

export async function clearStoredAuthSession(): Promise<void> {
  await browser.storage.local.remove(AUTH_SESSION_STORAGE_KEY);
}

export function parseStoredAuthSession(value: unknown): AuthSession | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as {
    accessToken?: unknown;
    refreshToken?: unknown;
    user?: {
      id?: unknown;
      email?: unknown;
      roles?: unknown;
      role?: unknown;
    };
  };
  if (
    typeof candidate.accessToken !== "string" ||
    typeof candidate.refreshToken !== "string" ||
    !candidate.user
  ) {
    return undefined;
  }
  const user = toPublicExtensionUser(candidate.user);
  if (!user) {
    return undefined;
  }
  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    user,
  };
}

export function persistableAuthSession(session: AuthSession): AuthSession {
  const user = toPublicExtensionUser(session.user);
  if (!user) {
    throw new Error("Cannot persist an AuthSession without current roles");
  }
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user,
  };
}
