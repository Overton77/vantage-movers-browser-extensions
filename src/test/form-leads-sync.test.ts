import { describe, expect, it, vi } from "vitest";

import type { Agent } from "../utils/api";
import type { FormLeadLookup, FormLeadUpdatePayload } from "../utils/api";
import { syncLeadCandidates } from "../workflows/form-leads/sync";
import type { LeadSyncCandidate, RowSyncResult } from "../workflows/form-leads/types";

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

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    _id: "agent-1",
    name: "Mike M",
    normalized_name: "mike m",
    active: true,
    created_from: "admin",
    granot_crm_username: "MIKEM",
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

  it("adds receiver_agent when CRM username matches and the lead has no receiver", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate({ salesRepRaw: " mikem " })],
      {
        getFormLeadById: async () =>
          makeLookup({ quoted: true, cubic_feet: 300, receiver_agent: null }),
        updateFormLead,
        agents: [makeAgent({ active: false })],
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(updateFormLead).toHaveBeenCalledWith("ref-1", {
      receiver_agent: "agent-1",
      receiver_agent_source: "extension_crm_username_match",
      receiver_agent_source_value: "MIKEM",
    } satisfies FormLeadUpdatePayload);
    expect(results["row-1"].status).toBe("updated");
    expect(results["row-1"].message).toContain("inactive Agent");
    expect(counts).toEqual({ updated: 1, unchanged: 0, failed: 0 });
  });

  it("does not overwrite an existing receiver_agent during CRM username matching", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    await syncLeadCandidates(
      [makeCandidate({ salesRepRaw: "MIKEM" })],
      {
        getFormLeadById: async () =>
          makeLookup({ receiver_agent: "existing-agent" }),
        updateFormLead,
        agents: [makeAgent()],
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(updateFormLead).toHaveBeenCalledWith("ref-1", {
      quoted: true,
      cubic_feet: 300,
    });
    expect(results["row-1"].message).toContain("did not overwrite");
  });

  it("counts an API failure as failed", async () => {
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

  it("skips duplicate quarantine leads without PATCHing", async () => {
    const updateFormLead = vi.fn(async () => makeLookup());
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeCandidate()],
      {
        getFormLeadById: async () =>
          makeLookup({ duplicate: true }),
        updateFormLead,
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(updateFormLead).not.toHaveBeenCalled();
    expect(results["row-1"].status).toBe("skipped");
    expect(results["row-1"].message).toContain("duplicate");
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
