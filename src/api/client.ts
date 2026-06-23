// Vantage API transport. Owns the shared fetch wrapper, response envelope, and
// auth headers. Extracted from `utils/api.ts` in Unit 04 so domain endpoint
// modules can share transport without re-implementing error handling.
import { VANTAGE_API_BASE, VANTAGE_API_SECRET } from "../config";
import { getAccessToken, refreshAuthSession, signOut } from "../auth/session";

export type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: string;
      issues?: unknown;
    };

export async function vantageFetch<T>(
  path: string,
  init: RequestInit,
): Promise<Extract<ApiEnvelope<T>, { ok: true }>> {
  const url = `${VANTAGE_API_BASE}${path}`;
  let response = await fetchWithAuth(url, init);
  if (response.status === 401 && !VANTAGE_API_SECRET) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      response = await fetchWithAuth(url, init);
    } else {
      await signOut();
    }
  }

  const envelope = (await response.json().catch(() => ({
    ok: false,
    error: response.statusText,
  }))) as ApiEnvelope<T>;

  if (!response.ok || !envelope.ok) {
    const message =
      !envelope.ok && envelope.error ? envelope.error : response.statusText;
    throw new Error(`Vantage request failed (${response.status}): ${message}`);
  }

  return envelope;
}

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders,
      ...init.headers,
    },
  });

  return response;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (VANTAGE_API_SECRET) {
    return { "x-api-secret": VANTAGE_API_SECRET };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Sign in is required for Vantage /api/v1 requests");
  }
  return { Authorization: `Bearer ${accessToken}` };
}
