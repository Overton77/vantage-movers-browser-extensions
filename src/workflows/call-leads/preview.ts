// Call Leads preview workflow. Maps a parsed `CallLeadPreviewResponse` into
// enrichment + booked-reconciliation payloads, runs the server preview
// endpoints, and merges results back by `row_id`. Server-driven: the extension
// never reimplements matching policy. Returns plain data; the popup owns status,
// state, and rendering.
import type {
  BookedCallLeadReconciliationResult,
  BookedCallLeadReconciliationRowPayload,
  CallLeadEnrichmentResult,
  CallLeadEnrichmentRowPayload,
} from "../../utils/api";
import {
  callLeadRowsToBookedReconciliationPayloads,
  callLeadRowsToEnrichmentPayloads,
  canSyncCallEnrichmentRow,
} from "./payloads";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
  CallLeadPreviewResponse,
} from "./types";

export type CallLeadPreviewContext = {
  previewEnrichment: (
    rows: CallLeadEnrichmentRowPayload[],
  ) => Promise<CallLeadEnrichmentResult[]>;
  previewBookedReconciliation: (
    rows: BookedCallLeadReconciliationRowPayload[],
  ) => Promise<BookedCallLeadReconciliationResult[]>;
};

export type CallLeadPreviewOutcome = {
  enrichmentRows: CallLeadEnrichmentPreview[];
  bookedReconciliationRows: BookedCallLeadReconciliationPreview[];
  /**
   * Row ids that should be selected by default (updateable enrichment rows).
   * `undefined` when the enrichment preview did not run or failed, so the popup
   * can preserve its current selection — matching prior behavior.
   */
  selectedRowIds?: string[];
  enrichmentError?: string;
  bookedError?: string;
};

export async function previewCallLeads(
  response: CallLeadPreviewResponse,
  context: CallLeadPreviewContext,
): Promise<CallLeadPreviewOutcome> {
  const enrichmentPayloads = callLeadRowsToEnrichmentPayloads(response);
  const bookedPayloads = callLeadRowsToBookedReconciliationPayloads(response);

  const outcome: CallLeadPreviewOutcome = {
    enrichmentRows: enrichmentPayloads.map((payload) => ({ payload })),
    bookedReconciliationRows: bookedPayloads.map((payload) => ({ payload })),
  };

  if (enrichmentPayloads.length > 0) {
    try {
      const results = await context.previewEnrichment(enrichmentPayloads);
      outcome.enrichmentRows = enrichmentPayloads.map((payload) => ({
        payload,
        result: results.find((result) => result.row_id === payload.row_id),
      }));
      outcome.selectedRowIds = outcome.enrichmentRows
        .filter(canSyncCallEnrichmentRow)
        .map((row) => row.payload.row_id);
    } catch (err) {
      outcome.enrichmentError =
        err instanceof Error ? err.message : String(err);
    }
  }

  if (bookedPayloads.length > 0) {
    try {
      const results =
        await context.previewBookedReconciliation(bookedPayloads);
      outcome.bookedReconciliationRows = bookedPayloads.map((payload) => ({
        payload,
        result: results.find((result) => result.row_id === payload.row_id),
      }));
    } catch (err) {
      outcome.bookedError = err instanceof Error ? err.message : String(err);
    }
  }

  return outcome;
}
