import { describe, expect, it } from "vitest";

import {
  buildFormLeadSyncPayload,
  buildFormLeadUpdatePayload,
  buildUnchangedMessage,
  buildUpdatedMessage,
  filterSelectedSyncableRows,
  isDirectFormLeadRowSyncable,
  isFallbackSyncable,
  isFormLeadPriorSyncable,
  isReceiverAgentEnrichmentSyncable,
  isRowSyncable,
  isSyncableRow,
  rowToSyncCandidate,
} from "../workflows/form-leads/payloads";
import type { FollowUpRow, LeadSyncCandidate } from "../workflows/form-leads/types";

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

describe("isSyncableRow", () => {
  it("is true only when status is syncable and quoted is a boolean", () => {
    expect(isSyncableRow(makeRow({ status: "syncable", quoted: true }))).toBe(
      true,
    );
    expect(isSyncableRow(makeRow({ status: "syncable", quoted: false }))).toBe(
      true,
    );
  });

  it("is false when quoted is missing", () => {
    expect(isSyncableRow(makeRow({ status: "syncable", quoted: undefined }))).toBe(
      false,
    );
  });

  it("is false for non-syncable statuses", () => {
    expect(isSyncableRow(makeRow({ status: "invalid_ref_no" }))).toBe(false);
    expect(isSyncableRow(makeRow({ status: "unsupported_prior" }))).toBe(false);
    expect(isSyncableRow(makeRow({ status: "missing_prior" }))).toBe(false);
  });
});

describe("rowToSyncCandidate", () => {
  it("projects the fields needed for sync", () => {
    const row = makeRow({
      id: "abc",
      refNo: "ref-123",
      quoted: false,
      cubicFeet: 500,
      status: "syncable",
      customer: "Ignored",
    });
    expect(rowToSyncCandidate(row)).toEqual({
      id: "abc",
      refNo: "ref-123",
      prior: "1",
      quoted: false,
      cubicFeet: 500,
      status: "syncable",
      vantageId: "ref-123",
    });
  });

  it("drops cubic_feet when prior is 0 (placeholder value not synced)", () => {
    const row = makeRow({ prior: "0", quoted: false, cubicFeet: 500 });
    expect(rowToSyncCandidate(row).cubicFeet).toBeUndefined();
  });

  it("keeps cubic_feet when prior is 1 or 5", () => {
    expect(
      rowToSyncCandidate(makeRow({ prior: "1", cubicFeet: 500 })).cubicFeet,
    ).toBe(500);
    expect(
      rowToSyncCandidate(makeRow({ prior: "5", cubicFeet: 500 })).cubicFeet,
    ).toBe(500);
  });

  it("drops location enrichment when prior is not field-syncable", () => {
    const candidate = rowToSyncCandidate(
      makeRow({
        prior: "0",
        from: "Barnesville,GA",
        fromZip: "30201",
        to: "Atlanta,GA",
        toZip: "30301",
      }),
    );

    expect(candidate.pickupCity).toBeUndefined();
    expect(candidate.pickupZip).toBeUndefined();
    expect(candidate.pickupState).toBeUndefined();
    expect(candidate.deliveryCity).toBeUndefined();
    expect(candidate.deliveryZip).toBeUndefined();
    expect(candidate.deliveryState).toBeUndefined();
  });

  it("uses the resolved Vantage id and derived quoted for a fallback match", () => {
    const row = makeRow({
      id: "fb",
      refNo: "not-an-id",
      quoted: undefined,
      prior: "1",
      cubicFeet: 500,
      status: "invalid_ref_no",
    });
    const candidate = rowToSyncCandidate(row, {
      state: "found_by_fallback",
      changes: [],
      message: "",
      matchMethod: "phone_and_email",
      resolvedVantageId: "resolved-id",
    });
    expect(candidate.vantageId).toBe("resolved-id");
    expect(candidate.quoted).toBe(true);
  });

  it("parses valid Granot locations and ignores comma and zero placeholders", () => {
    const candidate = rowToSyncCandidate(
      makeRow({
        from: "Barnesville,GA",
        fromZip: "30201",
        to: ",",
        toZip: "0",
      }),
    );

    expect(candidate).toMatchObject({
      pickupCity: "Barnesville",
      pickupState: "GA",
      pickupZip: "30201",
    });
    expect(candidate.deliveryCity).toBeUndefined();
    expect(candidate.deliveryState).toBeUndefined();
    expect(candidate.deliveryZip).toBeUndefined();
  });
});

describe("isFormLeadPriorSyncable", () => {
  it("is true only for prior 1 and 5", () => {
    expect(isFormLeadPriorSyncable("1")).toBe(true);
    expect(isFormLeadPriorSyncable("5")).toBe(true);
    expect(isFormLeadPriorSyncable("0")).toBe(false);
  });
});

describe("isDirectFormLeadRowSyncable", () => {
  it("requires both parser syncable status and prior 1 or 5", () => {
    expect(isDirectFormLeadRowSyncable(makeRow({ prior: "1" }))).toBe(true);
    expect(isDirectFormLeadRowSyncable(makeRow({ prior: "5" }))).toBe(true);
    expect(
      isDirectFormLeadRowSyncable(
        makeRow({ prior: "0", quoted: false, status: "syncable" }),
      ),
    ).toBe(false);
  });
});

describe("isRowSyncable", () => {
  it("is false for prior 0 even when parser marked the row syncable", () => {
    expect(
      isRowSyncable(makeRow({ prior: "0", quoted: false, status: "syncable" })),
    ).toBe(false);
  });

  it("is true for a found row with a CRM username even when priority is not field-syncable", () => {
    const row = makeRow({
      prior: "2",
      status: "unsupported_prior",
      quoted: undefined,
      salesRepRaw: "MIKEM",
    });
    const preview = {
      state: "idempotent" as const,
      changes: [],
      message: "",
      matchMethod: "mongo_id" as const,
      resolvedVantageId: "6a1743a401a95dbdc5bd8797",
    };

    expect(isReceiverAgentEnrichmentSyncable(row, preview)).toBe(true);
    expect(isRowSyncable(row, preview)).toBe(true);
  });

  it("is true for prior 1 direct rows", () => {
    expect(isRowSyncable(makeRow({ prior: "1" }))).toBe(true);
  });

  it("is true for a resolved conflict fallback preview", () => {
    const row = makeRow({
      prior: "1",
      status: "invalid_ref_no",
      quoted: undefined,
    });
    expect(
      isRowSyncable(row, {
        state: "conflict",
        changes: ["quoted false → true"],
        message: "Ambiguous fallback match: 2 form leads matched this phone/email.",
        matchMethod: "phone_and_email",
        resolvedVantageId: "top10-id",
        matchCount: 2,
      }),
    ).toBe(true);
    expect(
      isFallbackSyncable(row, {
        state: "conflict",
        changes: [],
        message: "",
        matchMethod: "phone_and_email",
        resolvedVantageId: "top10-id",
        matchCount: 2,
      }),
    ).toBe(true);
  });
});

function makeCandidate(
  overrides: Partial<LeadSyncCandidate> = {},
): LeadSyncCandidate {
  return {
    id: "row-1",
    refNo: "ref-1",
    prior: "1",
    quoted: true,
    cubicFeet: 300,
    status: "syncable",
    ...overrides,
  };
}

describe("buildFormLeadUpdatePayload", () => {
  it("only includes fields that differ from the current Vantage lead", () => {
    const candidate = makeCandidate({ quoted: true, cubicFeet: 400 });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: false,
      cubic_feet: 300,
    });
    expect(payload).toEqual({ quoted: true, cubic_feet: 400 });
  });

  it("omits quoted when it already matches", () => {
    const candidate = makeCandidate({ quoted: true, cubicFeet: 400 });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 300,
    });
    expect(payload).toEqual({ cubic_feet: 400 });
  });

  it("omits cubic_feet when it already matches", () => {
    const candidate = makeCandidate({ quoted: false, cubicFeet: 300 });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 300,
    });
    expect(payload).toEqual({ quoted: false });
  });

  it("omits cubic_feet when the candidate has no cubicFeet", () => {
    const candidate = makeCandidate({ quoted: true, cubicFeet: undefined });
    const payload = buildFormLeadUpdatePayload(candidate, { quoted: false });
    expect(payload).toEqual({ quoted: true });
  });

  it("omits quoted when the candidate is receiver-only", () => {
    const candidate = makeCandidate({
      quoted: undefined,
      cubicFeet: undefined,
    });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 100,
    });
    expect(payload).toEqual({});
  });

  it("omits cubic_feet when prior is 0 even if cubicFeet is set", () => {
    const candidate = makeCandidate({
      prior: "0",
      quoted: false,
      cubicFeet: 300,
    });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 100,
    });
    expect(payload).toEqual({ quoted: false });
  });

  it("returns an empty payload when nothing changed", () => {
    const candidate = makeCandidate({ quoted: true, cubicFeet: 300 });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 300,
    });
    expect(payload).toEqual({});
  });

  it("fills only missing location fields and never overwrites valid values", () => {
    const candidate = makeCandidate({
      pickupCity: "Barnesville",
      pickupState: "GA",
      pickupZip: "30201",
      deliveryCity: "Atlanta",
      deliveryState: "GA",
      deliveryZip: "30301",
    });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 300,
      pickup_city: undefined,
      pickup_state: "not_found",
      pickup_zip: "30201",
      delivery_city: "Existing City",
      delivery_state: "GA",
      destination_zip: "0",
    });

    expect(payload).toEqual({
      pickup_city: "Barnesville",
      pickup_state: "GA",
      destination_zip: "30301",
    });
  });

  it("does not combine a Granot state with a conflicting existing ZIP", () => {
    const candidate = makeCandidate({
      pickupCity: "Barnesville",
      pickupState: "GA",
      pickupZip: "30201",
    });

    expect(
      buildFormLeadUpdatePayload(candidate, {
        quoted: true,
        cubic_feet: 300,
        pickup_zip: "10001",
        pickup_state: "not_found",
      }),
    ).toEqual({ pickup_city: "Barnesville" });
  });
});

describe("buildFormLeadSyncPayload", () => {
  it("includes idempotent target fields when present", () => {
    expect(
      buildFormLeadSyncPayload(makeCandidate({ quoted: false, cubicFeet: 250 })),
    ).toEqual({ quoted: false, cubic_feet: 250 });
  });

  it("omits quoted when it is not a boolean", () => {
    expect(
      buildFormLeadSyncPayload(
        makeCandidate({ quoted: undefined, cubicFeet: 250 }),
      ),
    ).toEqual({ cubic_feet: 250 });
  });

  it("omits cubic_feet when it is not a number", () => {
    expect(
      buildFormLeadSyncPayload(
        makeCandidate({ quoted: true, cubicFeet: undefined }),
      ),
    ).toEqual({ quoted: true });
  });

  it("omits cubic_feet when prior is 0 even if cubicFeet is set", () => {
    expect(
      buildFormLeadSyncPayload(
        makeCandidate({ prior: "0", quoted: false, cubicFeet: 300 }),
      ),
    ).toEqual({ quoted: false });
  });
});

describe("filterSelectedSyncableRows", () => {
  it("returns only selected rows that pass isRowSyncable", () => {
    const syncable = makeRow({ id: "syncable" });
    const notSelected = makeRow({ id: "other" });
    const notQuoted = makeRow({ id: "prior0", prior: "0", quoted: false });
    const rows = [syncable, notSelected, notQuoted];
    const selected = new Set(["syncable", "prior0"]);

    expect(
      filterSelectedSyncableRows(rows, selected, new Map()).map((row) => row.id),
    ).toEqual(["syncable"]);
  });

  it("includes selected receiver-enrichment rows even when priority is unsupported", () => {
    const receiverOnly = makeRow({
      id: "receiver-only",
      prior: "2",
      status: "unsupported_prior",
      quoted: undefined,
      salesRepRaw: "MIKEM",
    });
    const selected = new Set(["receiver-only"]);

    expect(
      filterSelectedSyncableRows(
        [receiverOnly],
        selected,
        new Map([
          [
            "receiver-only",
            {
              state: "idempotent",
              changes: [],
              message: "",
              matchMethod: "mongo_id",
              resolvedVantageId: "resolved-id",
            },
          ],
        ]),
      ).map((row) => row.id),
    ).toEqual(["receiver-only"]);
  });
});

describe("messages", () => {
  it("buildUnchangedMessage includes quoted and cubic_feet", () => {
    expect(
      buildUnchangedMessage(makeCandidate({ quoted: true, cubicFeet: 300 })),
    ).toBe("Already quoted=true, cubic_feet=300");
  });

  it("buildUnchangedMessage omits cubic_feet when absent", () => {
    expect(
      buildUnchangedMessage(
        makeCandidate({ quoted: false, cubicFeet: undefined }),
      ),
    ).toBe("Already quoted=false");
  });

  it("buildUpdatedMessage lists each changed field", () => {
    expect(buildUpdatedMessage({ quoted: true, cubic_feet: 400 })).toBe(
      "Updated quoted=true, Updated cubic_feet=400",
    );
    expect(buildUpdatedMessage({ cubic_feet: 400 })).toBe(
      "Updated cubic_feet=400",
    );
  });
});
