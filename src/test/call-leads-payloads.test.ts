import { describe, expect, it } from "vitest";

import {
  callLeadRowsToBookedReconciliationPayloads,
  callLeadRowsToEnrichmentPayloads,
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../workflows/call-leads/payloads";
import type {
  CallLeadEnrichmentPreview,
  CallLeadPreviewResponse,
} from "../workflows/call-leads/types";

function makePreview(): CallLeadPreviewResponse {
  return {
    ok: true,
    pageFound: true,
    sections: [
      {
        key: "bookedJobs",
        title: "Booked Jobs",
        tableFound: true,
        headers: ["job_no", "source", "prior"],
        rows: [
          {
            id: "booked-1",
            rowIndex: 1,
            values: {
              job_no: "P5556352",
              source: "Top10 Forms",
              prior: "5",
              book_date: "05/23/2026",
              customer: "Helen Fazio",
              phone: "+19178439250",
              email: "  hana29@aol.com ",
              from_zip: "10301",
              to_zip: "18347",
              est_cf: "300",
            },
          },
        ],
      },
      {
        key: "followUpEstimates",
        title: "Follow Up Estimates",
        tableFound: true,
        headers: ["job_no", "source"],
        rows: [
          {
            id: "follow-1",
            rowIndex: 1,
            values: {
              job_no: "P5556259",
              customer: "Luis Cruz",
              phone: "+19169326256",
              email: "luiscruz170@yahoo.com",
              from_zip: "85308",
              to_zip: "95662",
              est_cf: "  ",
            },
          },
        ],
      },
    ],
  };
}

describe("callLeadRowsToEnrichmentPayloads", () => {
  it("maps the Follow Up Estimates section into enrichment payloads", () => {
    const payloads = callLeadRowsToEnrichmentPayloads(makePreview());
    expect(payloads).toEqual([
      {
        row_id: "follow-1",
        row_index: 1,
        job_no: "P5556259",
        customer: "Luis Cruz",
        phone: "+19169326256",
        email: "luiscruz170@yahoo.com",
        from_zip: "85308",
        to_zip: "95662",
        // est_cf was whitespace-only -> trimmed to undefined
        est_cf: undefined,
      },
    ]);
  });

  it("returns an empty array when there is no follow-up section", () => {
    const preview = makePreview();
    preview.sections = preview.sections.filter(
      (section) => section.key !== "followUpEstimates",
    );
    expect(callLeadRowsToEnrichmentPayloads(preview)).toEqual([]);
  });
});

describe("callLeadRowsToBookedReconciliationPayloads", () => {
  it("maps the Booked Jobs section, including section/source/prior/book_date", () => {
    const payloads = callLeadRowsToBookedReconciliationPayloads(makePreview());
    expect(payloads).toEqual([
      {
        row_id: "booked-1",
        row_index: 1,
        section: "bookedJobs",
        job_no: "P5556352",
        source: "Top10 Forms",
        prior: "5",
        book_date: "05/23/2026",
        customer: "Helen Fazio",
        phone: "+19178439250",
        // email had surrounding whitespace and is trimmed
        email: "hana29@aol.com",
        from_zip: "10301",
        to_zip: "18347",
        est_cf: "300",
      },
    ]);
  });

  it("returns an empty array when there is no booked section", () => {
    const preview = makePreview();
    preview.sections = preview.sections.filter(
      (section) => section.key !== "bookedJobs",
    );
    expect(callLeadRowsToBookedReconciliationPayloads(preview)).toEqual([]);
  });
});

function enrichmentRow(status?: string): CallLeadEnrichmentPreview {
  return {
    payload: { row_id: "r1" },
    result: status
      ? {
          row_id: "r1",
          status: status as never,
          message: "",
          changes: [],
          warnings: [],
        }
      : undefined,
  };
}

describe("canSync predicates", () => {
  it("allows sync for updateable, unchanged, and updated statuses", () => {
    expect(canSyncCallEnrichmentRow(enrichmentRow("updateable"))).toBe(true);
    expect(canSyncCallEnrichmentRow(enrichmentRow("unchanged"))).toBe(true);
    expect(canSyncCallEnrichmentRow(enrichmentRow("updated"))).toBe(true);
  });

  it("blocks sync for other statuses and missing results", () => {
    expect(canSyncCallEnrichmentRow(enrichmentRow("no_match"))).toBe(false);
    expect(canSyncCallEnrichmentRow(enrichmentRow("conflict"))).toBe(false);
    expect(canSyncCallEnrichmentRow(enrichmentRow(undefined))).toBe(false);
    expect(canSyncCallEnrichmentRow(undefined)).toBe(false);
  });

  it("uses the same rule for booked reconciliation rows", () => {
    expect(
      canSyncBookedCallReconciliationRow({
        payload: { row_id: "b1" },
        result: {
          row_id: "b1",
          status: "updateable",
          message: "",
          changes: [],
          warnings: [],
        },
      }),
    ).toBe(true);
    expect(canSyncBookedCallReconciliationRow(undefined)).toBe(false);
  });
});
