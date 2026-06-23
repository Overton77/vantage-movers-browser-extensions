// Lead browse/list endpoints backing the Search workspace. These call the
// server browse routes (`GET /api/v1/form-leads`, `GET /api/v1/call-leads`)
// which accept optional filters: full-text `q`, standalone `source_company`,
// `name`/`email`/`phone_number` (and `job_no` for call leads), and booked /
// cancelled presence. An empty query lists the latest leads.
import { vantageFetch } from "./client";

/** Compact booking summary populated on a lead result. */
export type LeadBookingSummary = {
  _id: string;
  job_no?: string;
  book_date?: string;
  cancelled?: string | null;
};

/** Compact cancellation summary populated on a lead result. */
export type LeadCancellationSummary = {
  _id: string;
  cancel_date?: string;
  reason?: string;
  job_no?: string;
};

export type FormLeadCard = {
  _id: string;
  source_company?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  ref_no?: string;
  quoted?: boolean;
  cubic_feet?: number;
  createdAt?: string;
  booked: LeadBookingSummary | null;
  cancelled: LeadCancellationSummary | null;
};

export type CallLeadCard = {
  _id: string;
  source_company?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  job_no?: string;
  cubic_feet?: number;
  createdAt?: string;
  booked: LeadBookingSummary | null;
  cancelled: LeadCancellationSummary | null;
};

/** Optional filters shared by both browse endpoints. */
export type LeadBrowseQuery = {
  q?: string;
  source_company?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  job_no?: string;
  booked?: boolean;
  cancelled?: boolean;
  limit?: number;
  skip?: number;
};

export type FormLeadBrowseResponse = {
  results: FormLeadCard[];
  count: number;
};

export type CallLeadBrowseResponse = {
  results: CallLeadCard[];
  count: number;
};

function toQueryString(query: LeadBrowseQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function browseFormLeads(
  query: LeadBrowseQuery = {},
): Promise<FormLeadBrowseResponse> {
  const envelope = await vantageFetch<FormLeadBrowseResponse>(
    `/api/v1/form-leads${toQueryString(query)}`,
    { method: "GET" },
  );

  return envelope.data;
}

export async function browseCallLeads(
  query: LeadBrowseQuery = {},
): Promise<CallLeadBrowseResponse> {
  const envelope = await vantageFetch<CallLeadBrowseResponse>(
    `/api/v1/call-leads${toQueryString(query)}`,
    { method: "GET" },
  );

  return envelope.data;
}
