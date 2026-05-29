// Call Leads sync result helpers. Pure functions that merge server sync results
// back into preview rows (by `row_id`) and tally `updated/unchanged/failed`
// counts. The popup owns the actual batch API call, busy state, status copy,
// and rendering; these helpers keep the result-handling logic reusable/testable.
import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
} from "../../utils/api";
import type { SyncCounts } from "../form-leads/types";
import { canSyncCallEnrichmentRow } from "./payloads";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
} from "./types";

export function mergeEnrichmentResults(
  rows: CallLeadEnrichmentPreview[],
  results: CallLeadEnrichmentResult[],
): CallLeadEnrichmentPreview[] {
  return rows.map((preview) => ({
    ...preview,
    result:
      results.find((result) => result.row_id === preview.payload.row_id) ??
      preview.result,
  }));
}

export function mergeBookedReconciliationResults(
  rows: BookedCallLeadReconciliationPreview[],
  results: BookedCallLeadReconciliationResult[],
): BookedCallLeadReconciliationPreview[] {
  return rows.map((preview) => ({
    ...preview,
    result:
      results.find((result) => result.row_id === preview.payload.row_id) ??
      preview.result,
  }));
}

export function selectedEnrichmentRowIds(
  rows: CallLeadEnrichmentPreview[],
): string[] {
  return rows.filter(canSyncCallEnrichmentRow).map((row) => row.payload.row_id);
}

export function countEnrichmentResults(
  results: CallLeadEnrichmentResult[],
): SyncCounts {
  return {
    updated: results.filter((result) => result.status === "updated").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    failed: results.filter(
      (result) => result.status === "failed" || result.status === "conflict",
    ).length,
  };
}

export function countBookedReconciliationResults(
  results: BookedCallLeadReconciliationResult[],
): SyncCounts {
  return {
    updated: results.filter((result) => result.status === "updated").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    failed: results.filter(
      (result) =>
        result.status === "failed" ||
        result.status === "conflict" ||
        result.status === "booking_missing" ||
        result.status === "no_match" ||
        result.status === "invalid",
    ).length,
  };
}
