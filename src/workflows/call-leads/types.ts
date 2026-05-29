// Shared types for the Call Leads workflow (enrichment + booked
// reconciliation). Extracted from popup/main.ts in Unit 02.
import type {
  BookedCallLeadReconciliationResult,
  BookedCallLeadReconciliationRowPayload,
  CallLeadEnrichmentResult,
  CallLeadEnrichmentRowPayload,
} from "../../utils/api";

export type CallLeadPreviewRow = {
  id: string;
  rowIndex: number;
  values: Record<string, string>;
};

export type CallLeadPreviewSection = {
  key: "bookedJobs" | "followUpEstimates";
  title: string;
  tableFound: boolean;
  headers: string[];
  rows: CallLeadPreviewRow[];
};

export type CallLeadPreviewResponse = {
  ok: true;
  pageFound: boolean;
  sections: CallLeadPreviewSection[];
  frameResponses?: number;
  frameCount?: number;
};

export type CallLeadEnrichmentPreview = {
  payload: CallLeadEnrichmentRowPayload;
  result?: CallLeadEnrichmentResult;
};

export type BookedCallLeadReconciliationPreview = {
  payload: BookedCallLeadReconciliationRowPayload;
  result?: BookedCallLeadReconciliationResult;
};
