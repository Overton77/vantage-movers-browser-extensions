// Call Lead API endpoints (enrichment + booked reconciliation). Extracted from
// `utils/api.ts` in Unit 04.
import { vantageFetch } from "./client";

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

export type BookedCallLeadReconciliationRowPayload = {
  row_id: string;
  row_index?: number;
  section?: "bookedJobs" | "followUpEstimates";
  job_no?: string;
  source?: string;
  prior?: string;
  book_date?: string;
  customer?: string;
  phone?: string;
  email?: string;
  from_zip?: string;
  to_zip?: string;
  est_cf?: string;
};

export type CallLeadMatchMethod =
  | "phone_and_job_no"
  | "phone_only"
  | "job_no_only"
  | "none";

export type CallLeadEnrichmentResult = {
  row_id: string;
  status:
    | "updateable"
    | "updated"
    | "unchanged"
    | "conflict"
    | "no_match"
    | "invalid"
    | "failed";
  message: string;
  call_lead_id?: string;
  matched_phone_number?: string;
  job_no?: string;
  /** How the call lead was located in Vantage. */
  match_method?: CallLeadMatchMethod;
  /** Whether the matched call lead has a Vantage booking attached. */
  has_booking?: boolean;
  changes: string[];
  warnings: string[];
  parsed?: Record<string, unknown>;
};

export type BookedCallLeadMatchMethod =
  | "job_no_with_booking"
  | "job_no_only"
  | "phone_only"
  | "none";

export type BookedCallLeadReconciliationResult = {
  row_id: string;
  status:
    | "updateable"
    | "updated"
    | "unchanged"
    | "booking_missing"
    | "no_match"
    | "invalid"
    | "conflict"
    | "failed";
  message: string;
  job_no?: string;
  booking_id?: string;
  call_lead_id?: string;
  /** How we found the Vantage booking / call lead for this Booked Jobs row. */
  match_method?: BookedCallLeadMatchMethod;
  /** Whether the matched call lead has a Vantage booking attached. */
  has_booking?: boolean;
  changes: string[];
  warnings: string[];
  parsed?: Record<string, unknown>;
};

export async function previewCallLeadEnrichment(
  rows: CallLeadEnrichmentRowPayload[],
): Promise<CallLeadEnrichmentResult[]> {
  const envelope = await vantageFetch<CallLeadEnrichmentResult[]>(
    `/api/v1/call-leads/enrichment/preview`,
    {
      method: "POST",
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
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );

  return envelope.data;
}

export async function previewBookedCallLeadReconciliation(
  rows: BookedCallLeadReconciliationRowPayload[],
): Promise<BookedCallLeadReconciliationResult[]> {
  const envelope = await vantageFetch<BookedCallLeadReconciliationResult[]>(
    `/api/v1/call-leads/booked-reconciliation/preview`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );

  return envelope.data;
}

export async function syncBookedCallLeadReconciliation(
  rows: BookedCallLeadReconciliationRowPayload[],
): Promise<BookedCallLeadReconciliationResult[]> {
  const envelope = await vantageFetch<BookedCallLeadReconciliationResult[]>(
    `/api/v1/call-leads/booked-reconciliation/sync`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );

  return envelope.data;
}
