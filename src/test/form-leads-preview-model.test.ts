import { describe, expect, it } from "vitest";

import type { FormLeadLookup } from "../utils/api";
import { buildFormLeadRowPreview } from "../workflows/form-leads/preview-model";
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
    _id: "6a1743a401a95dbdc5bd8797",
    ref_no: "6a1743a401a95dbdc5bd8797",
    quoted: true,
    cubic_feet: 300,
    ...overrides,
  };
}

describe("buildFormLeadRowPreview", () => {
  it("flags a booked lead with no changes as idempotent has_booking", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ quoted: true, cubicFeet: 300 }),
      makeLookup({ quoted: true, cubic_feet: 300, booked: "booking-1" }),
    );
    expect(preview.state).toBe("has_booking");
    expect(preview.changes).toEqual([]);
    expect(preview.message).toContain("idempotent");
    expect(preview.message).toContain("booking-1");
  });

  it("flags a booked lead with changes as has_booking and preserves the link", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ quoted: true, cubicFeet: 450 }),
      makeLookup({ quoted: false, cubic_feet: 300, booked: "booking-9" }),
    );
    expect(preview.state).toBe("has_booking");
    expect(preview.changes).toEqual([
      "quoted false → true",
      "cubic_feet 300 → 450",
    ]);
    expect(preview.message).toContain("booking link is preserved");
  });

  it("returns idempotent when no booking and fields already match", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ quoted: true, cubicFeet: 300 }),
      makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
    );
    expect(preview.state).toBe("idempotent");
    expect(preview.changes).toEqual([]);
  });

  it("returns will_update with the diffed fields when no booking", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ quoted: false, cubicFeet: 200 }),
      makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
    );
    expect(preview.state).toBe("will_update");
    expect(preview.changes).toEqual([
      "quoted true → false",
      "cubic_feet 300 → 200",
    ]);
    expect(preview.message).toContain("Sync will change");
  });

  it("renders missing current values as 'missing'", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ quoted: true, cubicFeet: 300 }),
      makeLookup({ quoted: undefined, cubic_feet: undefined, booked: null }),
    );
    expect(preview.state).toBe("will_update");
    expect(preview.changes).toEqual([
      "quoted missing → true",
      "cubic_feet missing → 300",
    ]);
  });
});
