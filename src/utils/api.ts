import { VANTAGE_API_BASE, VANTAGE_API_SECRET } from '../config';
import { error, log, warn } from './logger';

export type PingPayload = {
  source: 'granot-sync-extension';
  pageUrl: string;
  timestamp: string;
  /** Placeholder — replace with real Granot fields as you discover them */
  sampleValue?: string;
};

/**
 * Sends a test payload to the Vantage server.
 * Wire up a real endpoint once you know which route to hit.
 */
export async function pingServer(payload: PingPayload): Promise<void> {
  const url = `${VANTAGE_API_BASE}/health`;

  log('Pinging server:', url, payload);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    log('Server response:', response.status, response.statusText);

    if (!response.ok) {
      warn('Non-OK response from server');
    }
  } catch (err) {
    error('Failed to reach server:', err);
    throw err;
  }
}

export type FormLeadLookup = {
  _id: string;
  ref_no?: string;
  quoted?: boolean;
};

export type CallLeadEnrichmentRowPayload = {
  row_id: string;
  row_index?: number;
  job_no?: string;
  customer?: string;
  phone?: string;
  email?: string;
  from_zip?: string;
  to_zip?: string;
  est_cf?: string;
};

export type CallLeadEnrichmentResult = {
  row_id: string;
  status:
    | 'updateable'
    | 'updated'
    | 'unchanged'
    | 'conflict'
    | 'no_match'
    | 'invalid'
    | 'failed';
  message: string;
  call_lead_id?: string;
  matched_phone_number?: string;
  job_no?: string;
  changes: string[];
  warnings: string[];
  parsed?: Record<string, unknown>;
};

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: string;
      issues?: unknown;
    };

export async function getFormLeadById(id: string): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(`/api/v1/form-leads/${id}`, {
    method: 'GET',
  });

  return envelope.data;
}

export async function updateFormLeadQuoted(id: string, quoted: boolean): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(`/api/v1/form-leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ quoted }),
  });

  return envelope.data;
}

export async function previewCallLeadEnrichment(
  rows: CallLeadEnrichmentRowPayload[],
): Promise<CallLeadEnrichmentResult[]> {
  const envelope = await vantageFetch<CallLeadEnrichmentResult[]>(
    `/api/v1/call-leads/enrichment/preview`,
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
  );

  return envelope.data;
}

export async function syncCallLeadEnrichment(
  rows: CallLeadEnrichmentRowPayload[],
): Promise<CallLeadEnrichmentResult[]> {
  const envelope = await vantageFetch<CallLeadEnrichmentResult[]>(
    `/api/v1/call-leads/enrichment/sync`,
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    },
  );

  return envelope.data;
}

async function vantageFetch<T>(
  path: string,
  init: RequestInit,
): Promise<Extract<ApiEnvelope<T>, { ok: true }>> {
  if (!VANTAGE_API_SECRET) {
    throw new Error('Missing VITE_VANTAGE_API_SECRET for Vantage /api/v1 request');
  }

  const url = `${VANTAGE_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-api-secret': VANTAGE_API_SECRET,
      ...init.headers,
    },
  });

  const envelope = (await response.json().catch(() => ({
    ok: false,
    error: response.statusText,
  }))) as ApiEnvelope<T>;

  if (!response.ok || !envelope.ok) {
    const message = !envelope.ok && envelope.error ? envelope.error : response.statusText;
    throw new Error(`Vantage request failed (${response.status}): ${message}`);
  }

  return envelope;
}
