import {
  fetchExtensionMe,
  loginExtensionUser,
  logoutExtensionUser,
  refreshExtensionSession,
} from "./api";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
} from "./storage";
import type { AuthSession } from "./types";

let cachedSession: AuthSession | undefined;
let refreshPromise: Promise<AuthSession | undefined> | undefined;

export async function bootstrapAuthSession(): Promise<AuthSession | undefined> {
  const stored = await readStoredAuthSession();
  if (!stored) {
    cachedSession = undefined;
    return undefined;
  }

  cachedSession = stored;
  try {
    const user = await fetchExtensionMe(stored.accessToken);
    cachedSession = { ...stored, user };
    await writeStoredAuthSession(cachedSession);
    return cachedSession;
  } catch {
    return refreshAuthSession();
  }
}

export function getCachedAuthSession(): AuthSession | undefined {
  return cachedSession;
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const session = await loginExtensionUser(email, password);
  cachedSession = session;
  await writeStoredAuthSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  const accessToken = cachedSession?.accessToken;
  cachedSession = undefined;
  refreshPromise = undefined;
  await clearStoredAuthSession();
  await logoutExtensionUser(accessToken);
}

export async function getAccessToken(): Promise<string | undefined> {
  if (cachedSession?.accessToken) {
    return cachedSession.accessToken;
  }
  const stored = await readStoredAuthSession();
  if (!stored) {
    return undefined;
  }
  cachedSession = stored;
  return stored.accessToken;
}

export async function refreshAuthSession(): Promise<AuthSession | undefined> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshAuthSessionInner().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

async function refreshAuthSessionInner(): Promise<AuthSession | undefined> {
  const session = cachedSession ?? (await readStoredAuthSession());
  if (!session?.refreshToken) {
    cachedSession = undefined;
    await clearStoredAuthSession();
    return undefined;
  }

  try {
    const refreshed = await refreshExtensionSession(session.refreshToken);
    cachedSession = refreshed;
    await writeStoredAuthSession(refreshed);
    return refreshed;
  } catch {
    cachedSession = undefined;
    await clearStoredAuthSession();
    return undefined;
  }
}
