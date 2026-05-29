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
  quoted?: boolean;
  cubicFeet?: number;
  status: LeadStatus;
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
  | "not_found"
  | "preview_error"
  | "pending";

export type FormLeadRowPreview = {
  state: FormLeadMatchState;
  current?: FormLeadLookup;
  changes: string[];
  message: string;
  error?: string;
};

export type SyncCounts = {
  updated: number;
  unchanged: number;
  failed: number;
};
