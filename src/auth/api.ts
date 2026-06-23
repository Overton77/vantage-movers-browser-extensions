import { VANTAGE_API_BASE } from "../config";
import type { AuthSession, ExtensionUser } from "./types";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: string; issues?: unknown };

type SessionResponse = {
  user: ExtensionUser;
  accessToken: string;
  refreshToken: string;
};

export async function loginExtensionUser(
  email: string,
  password: string,
): Promise<AuthSession> {
  const data = await authFetch<SessionResponse>("/api/v1/extension/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data;
}

export async function refreshExtensionSession(
  refreshToken: string,
): Promise<AuthSession> {
  const data = await authFetch<SessionResponse>("/api/v1/extension/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  return data;
}

export async function fetchExtensionMe(accessToken: string): Promise<ExtensionUser> {
  const data = await authFetch<{ user: ExtensionUser }>("/api/v1/extension/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return data.user;
}

export async function logoutExtensionUser(accessToken?: string): Promise<void> {
  await authFetch<unknown>("/api/v1/extension/auth/logout", {
    method: "POST",
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  }).catch(() => undefined);
}

async function authFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${VANTAGE_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const envelope = (await response.json().catch(() => ({
    ok: false,
    error: response.statusText,
  }))) as ApiEnvelope<T>;

  if (!response.ok || !envelope.ok) {
    const message =
      !envelope.ok && envelope.error ? envelope.error : response.statusText;
    throw new Error(`Auth request failed (${response.status}): ${message}`);
  }

  return envelope.data;
}
