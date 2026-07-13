// Shared types for the Form Leads workflow (Booked Jobs / Follow Up Estimates
// tables and the Form Edit Lead page). Extracted from popup/main.ts in Unit 02
// so workflow logic and future background sync can depend on them without
// importing the popup entrypoint.
import type { FormLeadLookup } from "../../utils/api";

export type LeadStatus =
  | "syncable"
  | "invalid_ref_no"
  | "unsupported_prior"
  | "missing_prior";

export type FollowUpRow = {
  id: string;
  rowIndex: number;
  tableSource?: "bookedJobs" | "followUpEstimates";
  tableTitle?: string;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  estCf?: string;
  cubicFeet?: number;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  from?: string;
  fromZip?: string;
  to?: string;
  toZip?: string;
  /** Raw Granot `user` column value, falling back to `rep` when `user` is blank. */
  salesRepRaw?: string;
  status: LeadStatus;
  reason?: string;
};

export type CurrentFormLead = {
  id: string;
  refNo: string;
  prior: string;
  priorityLevel: number | undefined;
  quoted?: boolean;
  status: LeadStatus;
  reason?: string;
  pageUrl: string;
};

export type ParseResponse = {
  ok: true;
  tableFound: boolean;
  rows: FollowUpRow[];
  counts: {
    total: number;
    syncable: number;
    invalid: number;
    unsupported: number;
  };
  frameResponses?: number;
  frameCount?: number;
};

export type CurrentFormLeadParseResponse = {
  ok: true;
  pageFound: boolean;
  lead?: CurrentFormLead;
  frameResponses?: number;
  frameCount?: number;
};

export type LeadSyncCandidate = {
  id: string;
  refNo: string;
  /** Granot `prior` value; used to suppress placeholder est_cf when prior is 0. */
  prior?: string;
  quoted?: boolean;
  cubicFeet?: number;
  pickupCity?: string;
  pickupZip?: string;
  pickupState?: string;
  deliveryCity?: string;
  deliveryZip?: string;
  deliveryState?: string;
  /** Raw Granot `user`/`rep` value used for CRM username receiver matching. */
  salesRepRaw?: string;
  status: LeadStatus;
  /**
   * Resolved Vantage form lead `_id` to PATCH. For direct id matches this is
   * the Granot `refNo`; for fallback (phone/email) matches it is the Vantage
   * `_id` returned by search, which must never be the Granot `refNo` string.
   */
  vantageId?: string;
};

export type CurrentLeadPreview = {
  lead: CurrentFormLead;
  currentQuoted?: boolean;
  currentCubicFeet?: number;
  /** Mongo id of an attached BookedLead, if any. */
  currentBooked?: string | null;
  error?: string;
};

export type RowSyncResult = {
  status: "updated" | "unchanged" | "failed" | "skipped";
  message: string;
  /** Latest Vantage form lead returned by sync, used to refresh row state. */
  current?: FormLeadLookup;
};

/**
 * Describes what we know about a Vantage form lead BEFORE we sync — populated
 * by previewing each row against `GET /api/v1/form-leads/:id` after a scan.
 * The popup uses this to render precise messaging like "found · has booking"
 * vs. "found · will update".
 */
export type FormLeadMatchState =
  | "has_booking"
  | "idempotent"
  | "will_update"
  | "found_by_fallback"
  | "conflict"
  | "not_found"
  | "preview_error"
  | "pending";

/**
 * How a Vantage form lead was located for a Granot row.
 * - `mongo_id`: the Granot `ref_no` resolved directly via `GET /form-leads/:id`.
 * - `phone_and_email`: recovered by `POST /form-leads/search` using fallback fields.
 * - `none`: no match (or not yet resolved).
 */
export type FormLeadMatchMethod = "mongo_id" | "phone_and_email" | "none";

export type FormLeadRowPreview = {
  state: FormLeadMatchState;
  current?: FormLeadLookup;
  changes: string[];
  message: string;
  error?: string;
  /** How the lead was located, when one was found. */
  matchMethod?: FormLeadMatchMethod;
  /** Vantage `_id` to patch when synced (the resolved id, not the Granot refNo). */
  resolvedVantageId?: string;
  /** Number of fallback candidates the server returned (used to detect conflicts). */
  matchCount?: number;
};

export type SyncCounts = {
  updated: number;
  unchanged: number;
  failed: number;
};
