import { describe, expect, it } from "vitest";

import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
} from "../utils/api";
import {
  countBookedReconciliationResults,
  countEnrichmentResults,
  mergeBookedReconciliationResults,
  mergeEnrichmentResults,
  selectedEnrichmentRowIds,
} from "../workflows/call-leads/sync";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
} from "../workflows/call-leads/types";

function enrichmentResult(
  row_id: string,
  status: CallLeadEnrichmentResult["status"],
): CallLeadEnrichmentResult {
  return { row_id, status, message: "", changes: [], warnings: [] };
}

function bookedResult(
  row_id: string,
  status: BookedCallLeadReconciliationResult["status"],
): BookedCallLeadReconciliationResult {
  return { row_id, status, message: "", changes: [], warnings: [] };
}

describe("countEnrichmentResults", () => {
  it("tallies updated, unchanged, and failed (failed + conflict)", () => {
    const counts = countEnrichmentResults([
      enrichmentResult("a", "updated"),
      enrichmentResult("b", "unchanged"),
      enrichmentResult("c", "failed"),
      enrichmentResult("d", "conflict"),
      enrichmentResult("e", "no_match"),
    ]);
    expect(counts).toEqual({ updated: 1, unchanged: 1, failed: 2 });
  });
});

describe("countBookedReconciliationResults", () => {
  it("treats booking_missing, no_match, invalid, conflict, and failed as failed/missing", () => {
    const counts = countBookedReconciliationResults([
      bookedResult("a", "updated"),
      bookedResult("b", "unchanged"),
      bookedResult("c", "failed"),
      bookedResult("d", "conflict"),
      bookedResult("e", "booking_missing"),
      bookedResult("f", "no_match"),
      bookedResult("g", "invalid"),
    ]);
    expect(counts).toEqual({ updated: 1, unchanged: 1, failed: 5 });
  });
});

describe("mergeEnrichmentResults", () => {
  it("matches results by row_id and preserves prior results without a new match", () => {
    const rows: CallLeadEnrichmentPreview[] = [
      { payload: { row_id: "r1" }, result: enrichmentResult("r1", "updateable") },
      { payload: { row_id: "r2" } },
    ];
    const merged = mergeEnrichmentResults(rows, [
      enrichmentResult("r2", "updated"),
    ]);
    expect(merged[0].result?.status).toBe("updateable");
    expect(merged[1].result?.status).toBe("updated");
  });
});

describe("mergeBookedReconciliationResults", () => {
  it("matches booked results by row_id", () => {
    const rows: BookedCallLeadReconciliationPreview[] = [
      { payload: { row_id: "b1" } },
      { payload: { row_id: "b2" } },
    ];
    const merged = mergeBookedReconciliationResults(rows, [
      bookedResult("b2", "updated"),
    ]);
    expect(merged[0].result).toBeUndefined();
    expect(merged[1].result?.status).toBe("updated");
  });
});

describe("selectedEnrichmentRowIds", () => {
  it("selects updateable, unchanged, and updated rows", () => {
    const rows: CallLeadEnrichmentPreview[] = [
      { payload: { row_id: "a" }, result: enrichmentResult("a", "updateable") },
      { payload: { row_id: "b" }, result: enrichmentResult("b", "unchanged") },
      { payload: { row_id: "c" }, result: enrichmentResult("c", "updated") },
      { payload: { row_id: "d" }, result: enrichmentResult("d", "no_match") },
      { payload: { row_id: "e" } },
    ];
    expect(selectedEnrichmentRowIds(rows)).toEqual(["a", "b", "c"]);
  });
});
