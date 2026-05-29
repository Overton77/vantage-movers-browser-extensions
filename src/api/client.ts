// Vantage API transport. Owns the shared fetch wrapper, response envelope, and
// auth headers. Extracted from `utils/api.ts` in Unit 04 so domain endpoint
// modules can share transport without re-implementing error handling.
import { VANTAGE_API_BASE, VANTAGE_API_SECRET } from "../config";

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
  if (!VANTAGE_API_SECRET) {
    throw new Error(
      "Missing VITE_VANTAGE_API_SECRET for Vantage /api/v1 request",
    );
  }

  const url = `${VANTAGE_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-secret": VANTAGE_API_SECRET,
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
    throw new Error(`Vantage request failed (${response.status}): ${message}`);
  }

  return envelope;
}
