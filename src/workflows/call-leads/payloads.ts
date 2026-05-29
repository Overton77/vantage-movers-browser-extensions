// Pure helpers that map parsed Call Leads preview sections into Vantage API
// payloads, plus the "is this row syncable?" predicates. No DOM / messaging.
import type {
  BookedCallLeadReconciliationRowPayload,
  CallLeadEnrichmentRowPayload,
} from "../../utils/api";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
  CallLeadPreviewResponse,
  CallLeadPreviewRow,
} from "./types";

export function canSyncCallEnrichmentRow(
  row?: CallLeadEnrichmentPreview,
): boolean {
  return isSyncAllowedCallStatus(row?.result?.status);
}

export function canSyncBookedCallReconciliationRow(
  row?: BookedCallLeadReconciliationPreview,
): boolean {
  return isSyncAllowedCallStatus(row?.result?.status);
}

function isSyncAllowedCallStatus(status?: string): boolean {
  return (
    status === "updateable" || status === "unchanged" || status === "updated"
  );
}

export function callLeadRowsToEnrichmentPayloads(
  preview: CallLeadPreviewResponse,
): CallLeadEnrichmentRowPayload[] {
  const followUp = preview.sections.find(
    (section) => section.key === "followUpEstimates",
  );
  if (!followUp) {
    return [];
  }
  return followUp.rows.map((row) => ({
    row_id: row.id,
    row_index: row.rowIndex,
    job_no: getPreviewValue(row, "job_no"),
    customer: getPreviewValue(row, "customer"),
    phone: getPreviewValue(row, "phone"),
    email: getPreviewValue(row, "email"),
    from_zip: getPreviewValue(row, "from_zip"),
    to_zip: getPreviewValue(row, "to_zip"),
    est_cf: getPreviewValue(row, "est_cf"),
  }));
}

export function callLeadRowsToBookedReconciliationPayloads(
  preview: CallLeadPreviewResponse,
): BookedCallLeadReconciliationRowPayload[] {
  const booked = preview.sections.find(
    (section) => section.key === "bookedJobs",
  );
  if (!booked) {
    return [];
  }
  return booked.rows.map((row) => ({
    row_id: row.id,
    row_index: row.rowIndex,
    section: "bookedJobs",
    job_no: getPreviewValue(row, "job_no"),
    source: getPreviewValue(row, "source"),
    prior: getPreviewValue(row, "prior"),
    book_date: getPreviewValue(row, "book_date"),
    customer: getPreviewValue(row, "customer"),
    phone: getPreviewValue(row, "phone"),
    email: getPreviewValue(row, "email"),
    from_zip: getPreviewValue(row, "from_zip"),
    to_zip: getPreviewValue(row, "to_zip"),
    est_cf: getPreviewValue(row, "est_cf"),
  }));
}

function getPreviewValue(
  row: CallLeadPreviewRow,
  key: string,
): string | undefined {
  const value = row.values[key];
  return value?.trim() || undefined;
}
