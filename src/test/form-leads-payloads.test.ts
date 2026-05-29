import { describe, expect, it } from "vitest";

import {
  buildFormLeadSyncPayload,
  buildFormLeadUpdatePayload,
  buildUnchangedMessage,
  buildUpdatedMessage,
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
      quoted: false,
      cubicFeet: 500,
      status: "syncable",
    });
  });
});

function makeCandidate(
  overrides: Partial<LeadSyncCandidate> = {},
): LeadSyncCandidate {
  return {
    id: "row-1",
    refNo: "ref-1",
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

  it("returns an empty payload when nothing changed", () => {
    const candidate = makeCandidate({ quoted: true, cubicFeet: 300 });
    const payload = buildFormLeadUpdatePayload(candidate, {
      quoted: true,
      cubic_feet: 300,
    });
    expect(payload).toEqual({});
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
