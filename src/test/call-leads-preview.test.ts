import { describe, expect, it, vi } from "vitest";

import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
} from "../utils/api";
import { previewCallLeads } from "../workflows/call-leads/preview";
import type { CallLeadPreviewResponse } from "../workflows/call-leads/types";

function makePreview(): CallLeadPreviewResponse {
  return {
    ok: true,
    pageFound: true,
    sections: [
      {
        key: "bookedJobs",
        title: "Booked Jobs",
        tableFound: true,
        headers: ["job_no"],
        rows: [
          { id: "booked-1", rowIndex: 1, values: { job_no: "P1" } },
          { id: "booked-2", rowIndex: 2, values: { job_no: "P2" } },
        ],
      },
      {
        key: "followUpEstimates",
        title: "Follow Up Estimates",
        tableFound: true,
        headers: ["job_no"],
        rows: [
          { id: "follow-1", rowIndex: 1, values: { job_no: "P3" } },
          { id: "follow-2", rowIndex: 2, values: { job_no: "P4" } },
        ],
      },
    ],
  };
}

function enrichmentResult(
  overrides: Partial<CallLeadEnrichmentResult> & { row_id: string },
): CallLeadEnrichmentResult {
  return {
    status: "updateable",
    message: "",
    changes: [],
    warnings: [],
    ...overrides,
  };
}

function bookedResult(
  overrides: Partial<BookedCallLeadReconciliationResult> & { row_id: string },
): BookedCallLeadReconciliationResult {
  return {
    status: "updateable",
    message: "",
    changes: [],
    warnings: [],
    ...overrides,
  };
}

describe("previewCallLeads", () => {
  it("maps enrichment + booked results back by row_id regardless of order", async () => {
    const previewEnrichment = vi.fn(async () => [
      // returned out of order to prove we match by row_id, not index
      enrichmentResult({ row_id: "follow-2", status: "no_match" }),
      enrichmentResult({ row_id: "follow-1", status: "updateable" }),
    ]);
    const previewBookedReconciliation = vi.fn(async () => [
      bookedResult({ row_id: "booked-2", status: "updated" }),
      bookedResult({ row_id: "booked-1", status: "updateable" }),
    ]);

    const outcome = await previewCallLeads(makePreview(), {
      previewEnrichment,
      previewBookedReconciliation,
    });

    expect(
      outcome.enrichmentRows.map((row) => [
        row.payload.row_id,
        row.result?.status,
      ]),
    ).toEqual([
      ["follow-1", "updateable"],
      ["follow-2", "no_match"],
    ]);
    expect(
      outcome.bookedReconciliationRows.map((row) => [
        row.payload.row_id,
        row.result?.status,
      ]),
    ).toEqual([
      ["booked-1", "updateable"],
      ["booked-2", "updated"],
    ]);
    // only the updateable follow-up row is selected by default
    expect(outcome.selectedRowIds).toEqual(["follow-1"]);
  });

  it("captures an enrichment preview error and leaves rows payload-only", async () => {
    const outcome = await previewCallLeads(makePreview(), {
      previewEnrichment: async () => {
        throw new Error("enrichment down");
      },
      previewBookedReconciliation: async () => [
        bookedResult({ row_id: "booked-1" }),
        bookedResult({ row_id: "booked-2" }),
      ],
    });

    expect(outcome.enrichmentError).toBe("enrichment down");
    expect(outcome.enrichmentRows.every((row) => row.result === undefined)).toBe(
      true,
    );
    // selection is left untouched (undefined) so the popup keeps its current set
    expect(outcome.selectedRowIds).toBeUndefined();
    // booked still previewed successfully
    expect(outcome.bookedReconciliationRows[0].result?.status).toBe(
      "updateable",
    );
  });

  it("does not call preview endpoints when a section has no rows", async () => {
    const preview = makePreview();
    preview.sections = preview.sections.filter(
      (section) => section.key !== "followUpEstimates",
    );
    const previewEnrichment = vi.fn(async () => []);
    const previewBookedReconciliation = vi.fn(async () => [
      bookedResult({ row_id: "booked-1" }),
      bookedResult({ row_id: "booked-2" }),
    ]);

    await previewCallLeads(preview, {
      previewEnrichment,
      previewBookedReconciliation,
    });

    expect(previewEnrichment).not.toHaveBeenCalled();
    expect(previewBookedReconciliation).toHaveBeenCalledOnce();
  });
});
