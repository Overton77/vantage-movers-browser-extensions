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

  it("does not report quote/cubic_feet changes when prior is 0", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ prior: "0", quoted: false, cubicFeet: 200 }),
      makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
    );
    expect(preview.state).toBe("idempotent");
    expect(preview.changes).toEqual([]);
    expect(preview.message).toContain("receiver_agent");
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

  it("only reports location updates when replacing a not_found state", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({
        from: "Barnesville,GA",
        fromZip: "30201",
        to: "Atlanta,GA",
        toZip: "30301",
      }),
      makeLookup({
        pickup_city: undefined,
        pickup_state: "not_found",
        pickup_zip: "30201",
        delivery_city: undefined,
        delivery_state: undefined,
        destination_zip: "30301",
      }),
    );

    expect(preview.changes).toEqual(["pickup_state not_found → GA"]);
    expect(preview.message).not.toContain("pickup_city");
    expect(preview.message).not.toContain("delivery_city");
    expect(preview.message).not.toContain("delivery_state");
  });

  it("keeps hidden city-only updates actionable without naming the city field", () => {
    const preview = buildFormLeadRowPreview(
      makeRow({ from: "Barnesville,GA" }),
      makeLookup({ pickup_city: undefined, pickup_state: "GA" }),
    );

    expect(preview.state).toBe("will_update");
    expect(preview.hasChanges).toBe(true);
    expect(preview.changes).toEqual([]);
    expect(preview.message).toContain("Sync will update the form lead");
    expect(preview.message).not.toContain("pickup_city");
  });
});
