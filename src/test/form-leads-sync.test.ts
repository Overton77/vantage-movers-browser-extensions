import { describe, expect, it, vi } from "vitest";

import type { FormLeadLookup, FormLeadUpdatePayload } from "../utils/api";
import { syncLeadCandidates } from "../workflows/form-leads/sync";
import type { LeadSyncCandidate, RowSyncResult } from "../workflows/form-leads/types";

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

function makeLookup(overrides: Partial<FormLeadLookup> = {}): FormLeadLookup {
  return {
    _id: "ref-1",
    ref_no: "ref-1",
    quoted: true,
    cubic_feet: 300,
    booked: null,
    ...overrides,
  };
}

describe("syncLeadCandidates", () => {
  it("PATCHes only the changed fields and reports updated", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate({ quoted: true, cubicFeet: 400 })],
      {
        getFormLeadById: async () =>
          makeLookup({ quoted: false, cubic_feet: 300 }),
        updateFormLead,
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(updateFormLead).toHaveBeenCalledWith("ref-1", {
      quoted: true,
      cubic_feet: 400,
    } satisfies FormLeadUpdatePayload);
    expect(results["row-1"].status).toBe("updated");
    expect(counts).toEqual({ updated: 1, unchanged: 0, failed: 0 });
  });

  it("sends an idempotent payload when nothing changed and reports unchanged", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate({ quoted: true, cubicFeet: 300 })],
      {
        getFormLeadById: async () =>
          makeLookup({ quoted: true, cubic_feet: 300 }),
        updateFormLead,
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(updateFormLead).toHaveBeenCalledWith("ref-1", {
      quoted: true,
      cubic_feet: 300,
    });
    expect(results["row-1"].status).toBe("unchanged");
    expect(counts).toEqual({ updated: 0, unchanged: 1, failed: 0 });
  });

  it("skips a candidate without a quoted target and never calls the API", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const getFormLeadById = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate({ quoted: undefined })],
      { getFormLeadById, updateFormLead },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(getFormLeadById).not.toHaveBeenCalled();
    expect(updateFormLead).not.toHaveBeenCalled();
    expect(results["row-1"].status).toBe("skipped");
    expect(counts).toEqual({ updated: 0, unchanged: 0, failed: 0 });
  });

  it("counts an API failure as failed", async () => {
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate()],
      {
        getFormLeadById: async () => {
          throw new Error("boom");
        },
        updateFormLead: async () => makeLookup(),
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(results["row-1"].status).toBe("failed");
    expect(results["row-1"].message).toBe("boom");
    expect(counts).toEqual({ updated: 0, unchanged: 0, failed: 1 });
  });
});
