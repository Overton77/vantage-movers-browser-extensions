import { describe, expect, it } from "vitest";

import type { FormLeadLookup } from "../utils/api";
import { previewFormLeadRows } from "../workflows/form-leads/preview";
import type { FollowUpRow } from "../workflows/form-leads/types";

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    refNo: "6a1743a401a95dbdc5bd8797",
    prior: "1",
    status: "syncable",
    quoted: true,
    cubicFeet: 300,
    ...overrides,
  };
}

function makeLookup(overrides: Partial<FormLeadLookup> = {}): FormLeadLookup {
  return {
    _id: "lead",
    ref_no: "lead",
    quoted: true,
    cubic_feet: 300,
    booked: null,
    ...overrides,
  };
}

function lookupTable(table: Record<string, FormLeadLookup>) {
  return {
    getFormLeadById: async (id: string) => {
      const lead = table[id];
      if (!lead) {
        throw new Error("Form lead not found");
      }
      return lead;
    },
  };
}

describe("previewFormLeadRows", () => {
  it("returns will_update / idempotent / has_booking states per row", async () => {
    const rows = [
      makeRow({ id: "will", refNo: "will", quoted: false, cubicFeet: 200 }),
      makeRow({ id: "idem", refNo: "idem", quoted: true, cubicFeet: 300 }),
      makeRow({ id: "booked", refNo: "booked", quoted: true, cubicFeet: 450 }),
    ];

    const previews = await previewFormLeadRows(
      rows,
      lookupTable({
        will: makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
        idem: makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
        booked: makeLookup({ quoted: false, cubic_feet: 300, booked: "b-1" }),
      }),
    );

    expect(previews.get("will")?.state).toBe("will_update");
    expect(previews.get("idem")?.state).toBe("idempotent");
    expect(previews.get("booked")?.state).toBe("has_booking");
  });

  it("captures a 404-like lookup as not_found without failing the batch", async () => {
    const rows = [
      makeRow({ id: "ok", refNo: "ok" }),
      makeRow({ id: "missing", refNo: "missing" }),
    ];

    const previews = await previewFormLeadRows(
      rows,
      lookupTable({ ok: makeLookup() }),
    );

    expect(previews.get("ok")?.state).toBe("idempotent");
    expect(previews.get("missing")?.state).toBe("not_found");
    expect(previews.get("missing")?.error).toContain("not found");
  });

  it("records a preview_error for non-404 failures", async () => {
    const previews = await previewFormLeadRows([makeRow({ id: "boom" })], {
      getFormLeadById: async () => {
        throw new Error("network exploded");
      },
    });

    expect(previews.get("boom")?.state).toBe("preview_error");
    expect(previews.get("boom")?.message).toContain("network exploded");
  });

  it("skips rows that are not syncable", async () => {
    const previews = await previewFormLeadRows(
      [
        makeRow({ id: "skip", status: "invalid_ref_no" }),
        makeRow({ id: "skip-2", quoted: undefined }),
      ],
      lookupTable({}),
    );

    expect(previews.size).toBe(0);
  });
});
