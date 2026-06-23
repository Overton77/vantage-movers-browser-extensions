import type { AuthSession } from "./types";

export const AUTH_SESSION_STORAGE_KEY = "granot-sync:auth-session-v1";

export async function readStoredAuthSession(): Promise<AuthSession | undefined> {
  const stored = await browser.storage.local.get(AUTH_SESSION_STORAGE_KEY);
  const raw = stored?.[AUTH_SESSION_STORAGE_KEY] as AuthSession | undefined;
  return isAuthSession(raw) ? raw : undefined;
}

export async function writeStoredAuthSession(session: AuthSession): Promise<void> {
  await browser.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: session });
}

export async function clearStoredAuthSession(): Promise<void> {
  await browser.storage.local.remove(AUTH_SESSION_STORAGE_KEY);
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as AuthSession;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string" &&
    Boolean(candidate.user) &&
    typeof candidate.user.id === "string" &&
    typeof candidate.user.email === "string" &&
    (candidate.user.role === "owner" || candidate.user.role === "employee")
  );
}
