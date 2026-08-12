import { describe, expect, it } from "vitest";

import type { CallLeadsState, FormLeadsState } from "../app/state";
import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
  FormLeadLookup,
} from "../utils/api";
import {
  buildCallLeadCollapsedModel,
  buildCallLeadExpandedSummary,
  buildCallLeadScanMetrics,
  buildFormLeadCollapsedModel,
  buildFormLeadScanMetrics,
  formatSalesRepState,
  formatSyncOutcome,
} from "../entrypoints/popup/ui/leadMessaging";
import type { CallLeadPreviewRow } from "../workflows/call-leads/types";
import type {
  FollowUpRow,
  FormLeadRowPreview,
  RowSyncResult,
} from "../workflows/form-leads/types";

function makeFormState(overrides: Partial<FormLeadsState> = {}): FormLeadsState {
  return {
    parsedRows: [],
    selectedRowIds: new Set(),
    previews: new Map(),
    openRowIds: new Set(),
    syncResults: new Map(),
    cycles: [],
    progressFilter: "all",
    intervalValue: 30,
    intervalUnit: "seconds",
    autoRunning: false,
    hasScanned: true,
    logTablesOpen: false,
    followUpOpen: true,
    ...overrides,
  };
}

function makeCallState(overrides: Partial<CallLeadsState> = {}): CallLeadsState {
  return {
    enrichmentRows: [],
    bookedReconciliationRows: [],
    selectedRowIds: new Set(),
    openRowIds: new Set(),
    cycles: [],
    progressFilter: "all",
    intervalValue: 1,
    intervalUnit: "minutes",
    autoRunning: false,
    hasScanned: true,
    logTablesOpen: false,
    followUpOpen: true,
    bookedOpen: true,
    ...overrides,
  };
}

function makeFormRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "form-row-1",
    rowIndex: 1,
    tableTitle: "Booked Jobs",
    displayNumber: "1",
    refNo: "6a1743a401a95dbdc5bd8797",
    prior: "5",
    status: "syncable",
    quoted: true,
    cubicFeet: 300,
    customer: "Abigail Mayo",
    jobNo: "P5558796",
    salesRepRaw: "NICK",
    ...overrides,
  };
}

function makeLead(overrides: Partial<FormLeadLookup> = {}): FormLeadLookup {
  return {
    _id: "6a1743a401a95dbdc5bd8797",
    quoted: true,
    cubic_feet: 300,
    ...overrides,
  };
}

function makeFormPreview(
  overrides: Partial<FormLeadRowPreview> = {},
): FormLeadRowPreview {
  const current = makeLead(overrides.current);
  return {
    state: "idempotent",
    current,
    changes: [],
    message: "Found",
    matchMethod: "mongo_id",
    resolvedVantageId: current._id,
    ...overrides,
  };
}

function makeCallRow(overrides: Partial<CallLeadPreviewRow> = {}): CallLeadPreviewRow {
  return {
    id: "call-row-1",
    rowIndex: 1,
    values: {
      no: "1",
      customer: "Abigail Mayo",
      job_no: "P5558796",
      est_cf: "300",
      prior: "5",
      user: "NICK",
    },
    ...overrides,
  };
}

function makeEnrichmentResult(
  overrides: Partial<CallLeadEnrichmentResult> = {},
): CallLeadEnrichmentResult {
  return {
    row_id: "call-row-1",
    status: "updateable",
    message: "Will update cubic_feet",
    call_lead_id: "call-1",
    match_method: "phone_and_job_no",
    has_booking: false,
    changes: ["cubic_feet 200 -> 300"],
    warnings: [],
    ...overrides,
  };
}

function makeBookedResult(
  overrides: Partial<BookedCallLeadReconciliationResult> = {},
): BookedCallLeadReconciliationResult {
  return {
    row_id: "call-row-1",
    status: "unchanged",
    message: "Already matches",
    call_lead_id: "call-1",
    booking_id: "booking-1",
    match_method: "job_no_with_booking",
    has_booking: true,
    changes: [],
    warnings: [],
    ...overrides,
  };
}

describe("leadMessaging", () => {
  it("summarizes form leads without exposing invalid as a headline metric", () => {
    const direct = makeFormRow({ id: "direct" });
    const fallback = makeFormRow({
      id: "fallback",
      status: "invalid_ref_no",
      refNo: "not provided",
      quoted: undefined,
    });
    const notFound = makeFormRow({
      id: "not-found",
      status: "invalid_ref_no",
      refNo: "",
      quoted: undefined,
    });
    const state = makeFormState({
      parsedRows: [direct, fallback, notFound],
      previews: new Map([
        ["direct", makeFormPreview()],
        [
          "fallback",
          makeFormPreview({
            state: "found_by_fallback",
            matchMethod: "phone_and_email",
          }),
        ],
        [
          "not-found",
          makeFormPreview({
            state: "not_found",
            matchMethod: "none",
            resolvedVantageId: undefined,
            current: undefined,
          }),
        ],
      ]),
    });

    const metrics = buildFormLeadScanMetrics(state);

    expect(metrics.map((metric) => metric.label)).not.toContain("Invalid");
    expect(metrics.find((metric) => metric.label === "Parsed Rows")?.value).toBe(3);
    expect(metrics.find((metric) => metric.label === "Matched In Vantage")?.value).toBe(2);
    expect(metrics.find((metric) => metric.label === "Not Found")?.value).toBe(1);
    expect(metrics.find((metric) => metric.label === "Fallback Matches")?.help).toContain(
      "Granot ref_no did not resolve",
    );
  });

  it("renders a form fallback row as matched by phone and email after ref_no failed", () => {
    const row = makeFormRow({
      status: "invalid_ref_no",
      refNo: "not provided",
      quoted: undefined,
    });
    const preview = makeFormPreview({
      state: "found_by_fallback",
      matchMethod: "phone_and_email",
      current: makeLead({ booked: "booking-1", receiver_agent_name_snapshot: "Nick" }),
    });

    const card = buildFormLeadCollapsedModel(row, preview, undefined, true);

    expect(card.lines.join(" ")).toContain("Matched by phone + email after ref_no failed");
    expect(card.lines.join(" ")).toContain("Has booking");
    expect(card.lines.join(" ")).toContain("Sales Rep: Nick");
  });

  it("prefers the final form sync result over preview state", () => {
    const result: RowSyncResult = {
      status: "updated",
      message: "Updated cubic_feet=450",
    };

    const card = buildFormLeadCollapsedModel(
      makeFormRow(),
      makeFormPreview({ changes: [] }),
      result,
      true,
    );

    expect(card.lines.join(" ")).toContain("Updated: Updated cubic_feet=450");
  });

  it("summarizes call leads with owner-facing syncable and matching metrics", () => {
    const state = makeCallState({
      preview: {
        ok: true,
        pageFound: true,
        sections: [
          {
            key: "followUpEstimates",
            title: "Follow Up Estimates",
            tableFound: true,
            headers: [],
            rows: [makeCallRow({ id: "follow-1" })],
          },
          {
            key: "bookedJobs",
            title: "Booked Jobs",
            tableFound: true,
            headers: [],
            rows: [makeCallRow({ id: "booked-1" })],
          },
        ],
      },
      enrichmentRows: [
        { payload: { row_id: "follow-1" }, result: makeEnrichmentResult() },
      ],
      bookedReconciliationRows: [
        { payload: { row_id: "booked-1" }, result: makeBookedResult() },
      ],
    });

    const metrics = buildCallLeadScanMetrics(state);

    expect(metrics.find((metric) => metric.label === "Tables Found")?.value).toBe(2);
    expect(metrics.find((metric) => metric.label === "Matched In Vantage")?.value).toBe(2);
    expect(metrics.find((metric) => metric.label === "Syncable")?.value).toBe(2);
    expect(metrics.find((metric) => metric.label === "Matched Through Booking")?.value).toBe(1);
  });

  it("renders a booked call row matched through booking", () => {
    const card = buildCallLeadCollapsedModel(
      makeCallRow(),
      "booked",
      makeBookedResult({ receiver_agent_name_snapshot: "Nick" }),
      true,
    );

    expect(card.lines.join(" ")).toContain("Matched through booking");
    expect(card.lines.join(" ")).toContain("Unchanged");
    expect(card.lines.join(" ")).toContain("Has booking");
    expect(card.lines.join(" ")).toContain("Sales Rep: Nick");
  });

  it("shows a source mismatch message for call enrichment source conflicts", () => {
    const card = buildCallLeadCollapsedModel(
      makeCallRow({ values: { ...makeCallRow().values, source: "Top10 Forms" } }),
      "followUp",
      makeEnrichmentResult({
        status: "conflict",
        message:
          "Matched call lead has source Main Site Inbounds; CRM row source maps to Top10 Forms.",
        match_method: "phone_only",
        changes: [],
      }),
      false,
    );

    expect(card.lines.join(" ")).toContain(
      'Source mismatch: CRM source "Top10 Forms" differs from the matched Vantage source.',
    );
    expect(card.lines.join(" ")).toContain("Needs review");
  });

  it("shows a source mismatch message for booked call source conflicts", () => {
    const card = buildCallLeadExpandedSummary(
      makeCallRow({ values: { ...makeCallRow().values, source: "Main Site Inbounds" } }),
      "booked",
      makeBookedResult({
        status: "conflict",
        message:
          "Matched call lead has source_company top10_leads; CRM row source maps to main_site.",
        match_method: "job_no_with_booking",
      }),
    );

    expect(card.lines.join(" ")).toContain(
      'Source mismatch: CRM source "Main Site Inbounds" differs from the matched Vantage source.',
    );
  });

  it("formats sync outcomes and Sales Rep states", () => {
    expect(formatSyncOutcome("updated", ["cubic_feet 200 -> 300", "receiver_agent set"])).toBe(
      "Updated: cubic_feet and receiver_agent",
    );
    expect(formatSyncOutcome("failed", [], "Source mismatch")).toBe(
      "Failed: Source mismatch",
    );
    expect(formatSalesRepState("nick", undefined, [])).toBe(
      "Sales Rep: CRM NICK not linked",
    );
    expect(formatSalesRepState(undefined, undefined, [])).toBe("Sales Rep: none");
  });

  it("hides call-lead location fields from owner-facing update details", () => {
    expect(
      formatSyncOutcome("updateable", [
        "pickup_city missing -> Barnesville",
        "delivery_city missing -> Atlanta",
        "delivery_zip missing -> 30301",
      ]),
    ).toBe("Will update");
    expect(
      formatSyncOutcome("updated", [
        "pickup_state missing -> GA",
        "cubic_feet 200 -> 300",
      ]),
    ).toBe("Updated: cubic_feet");
  });
});
