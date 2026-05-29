import { describe, expect, it } from "vitest";

import {
  buildCycleSummary,
  callEnrichmentRowToCycleDetail,
  followUpRowToCycleDetail,
  formatIntervalLabel,
  intervalMs,
} from "../auto-sync/cycles";
import type { CallLeadEnrichmentPreview } from "../workflows/call-leads/types";
import type { FollowUpRow } from "../workflows/form-leads/types";

describe("intervalMs", () => {
  it("converts seconds, minutes, and hours", () => {
    expect(intervalMs(30, "seconds")).toBe(30_000);
    expect(intervalMs(2, "minutes")).toBe(120_000);
    expect(intervalMs(1, "hours")).toBe(3_600_000);
  });

  it("clamps to a minimum of 1 and rounds the input", () => {
    expect(intervalMs(0, "seconds")).toBe(1000);
    expect(intervalMs(1.4, "seconds")).toBe(1000);
    expect(intervalMs(1.6, "seconds")).toBe(2000);
  });
});

describe("formatIntervalLabel", () => {
  it("formats seconds compactly", () => {
    expect(formatIntervalLabel(30, "seconds")).toBe("30s");
  });

  it("pluralizes minutes and hours", () => {
    expect(formatIntervalLabel(1, "minutes")).toBe("1 minute");
    expect(formatIntervalLabel(5, "minutes")).toBe("5 minutes");
    expect(formatIntervalLabel(1, "hours")).toBe("1 hour");
    expect(formatIntervalLabel(3, "hours")).toBe("3 hours");
  });
});

describe("buildCycleSummary", () => {
  it("notes when nothing was synced", () => {
    expect(buildCycleSummary("12:00:00", 0)).toBe(
      "12:00:00: scanned, no supported rows were synced.",
    );
  });

  it("includes the sync counts when results are present", () => {
    expect(
      buildCycleSummary("12:00:00", 3, { updated: 1, unchanged: 1, failed: 1 }),
    ).toBe(
      "12:00:00: 3 syncable · 1 updated · 1 unchanged · 1 failed.",
    );
  });
});

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 4,
    displayNumber: "4",
    tableTitle: "Booked Jobs",
    customer: "Helen Fazio",
    refNo: "6a1743a401a95dbdc5bd8797",
    prior: "5",
    status: "syncable",
    quoted: true,
    cubicFeet: 300,
    ...overrides,
  };
}

describe("followUpRowToCycleDetail", () => {
  it("maps an updated result to an ok detail with the row fragments", () => {
    const detail = followUpRowToCycleDetail(makeRow(), {
      status: "updated",
      message: "Updated quoted=true",
    });
    expect(detail).toEqual({
      rowId: "row-1",
      rowLabel: "#4 Helen Fazio",
      status: "ok",
      message:
        "table=Booked Jobs, ref_no=6a1743a401a95dbdc5bd8797, quoted=true, cubic_feet=300 · Updated quoted=true",
    });
  });

  it("falls back to a skipped detail using the row reason when there is no result", () => {
    const detail = followUpRowToCycleDetail(
      makeRow({ status: "unsupported_prior", reason: "prior not supported" }),
    );
    expect(detail.status).toBe("skipped");
    expect(detail.message).toContain("prior not supported");
  });

  it("renders missing values defensively", () => {
    const detail = followUpRowToCycleDetail(
      makeRow({
        displayNumber: undefined,
        customer: undefined,
        refNo: "",
        quoted: undefined,
        cubicFeet: undefined,
        tableTitle: undefined,
      }),
      { status: "failed", message: "boom" },
    );
    expect(detail.rowLabel).toBe("#4 Unknown customer");
    expect(detail.status).toBe("failed");
    expect(detail.message).toBe(
      "ref_no=missing, quoted=n/a, cubic_feet=n/a · boom",
    );
  });
});

function enrichmentPreview(
  overrides: Partial<CallLeadEnrichmentPreview> = {},
): CallLeadEnrichmentPreview {
  return {
    payload: {
      row_id: "call-1",
      row_index: 2,
      customer: "Luis Cruz",
      phone: "+19169326256",
      job_no: "P5556259",
      est_cf: "300",
    },
    ...overrides,
  };
}

describe("callEnrichmentRowToCycleDetail", () => {
  it("maps an updated enrichment result, including changes", () => {
    const detail = callEnrichmentRowToCycleDetail(
      enrichmentPreview({
        result: {
          row_id: "call-1",
          status: "updated",
          message: "Updated call lead",
          changes: ["phone"],
          warnings: [],
        },
      }),
    );
    expect(detail.rowId).toBe("call-1");
    expect(detail.rowLabel).toBe("#2 Luis Cruz");
    expect(detail.status).toBe("ok");
    expect(detail.message).toBe(
      "phone=+19169326256, job_no=P5556259, est_cf=300 · Updated call lead · changes: phone",
    );
  });

  it("marks rows without a result as skipped / not syncable", () => {
    const detail = callEnrichmentRowToCycleDetail(enrichmentPreview());
    expect(detail.status).toBe("skipped");
    expect(detail.message).toContain("not syncable");
  });

  it("treats conflict as failed", () => {
    const detail = callEnrichmentRowToCycleDetail(
      enrichmentPreview({
        result: {
          row_id: "call-1",
          status: "conflict",
          message: "conflict",
          changes: [],
          warnings: [],
        },
      }),
    );
    expect(detail.status).toBe("failed");
  });
});
