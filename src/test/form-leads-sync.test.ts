import { describe, expect, it, vi } from "vitest";

import type { ExtensionGranotApplyItem, ExtensionGranotApplyResult } from "../lifecycle/types";
import { createMemoryPendingStore } from "../lifecycle/ledger";
import { syncLeadCandidates } from "../workflows/form-leads/sync";
import type {
  FollowUpRow,
  FormLeadRowPreview,
  RowSyncResult,
} from "../workflows/form-leads/types";

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    tableSource: "followUpEstimates",
    refNo: "G-100",
    prior: "1",
    quoted: true,
    cubicFeet: 300,
    customer: "Pat Example",
    phone: "5551112222",
    email: "pat@example.test",
    userRaw: "MIKEM",
    repRaw: "SALES1",
    salesRepRaw: "MIKEM",
    status: "syncable",
    ...overrides,
  };
}

function makePreview(
  overrides: Partial<FormLeadRowPreview> = {},
): FormLeadRowPreview {
  return {
    state: "will_update",
    matchMethod: "ref_no_exact",
    resolvedVantageId: "lead-1",
    current: { _id: "lead-1", ref_no: "G-100" },
    changes: ["priority"],
    message: "will update",
    ...overrides,
  };
}

function makeApplyResult(
  overrides: Partial<ExtensionGranotApplyResult> = {},
): ExtensionGranotApplyResult {
  return {
    operation_id: "11111111-1111-4111-8111-111111111111",
    receipt_id: "receipt-1",
    processing_state: "completed",
    outcome: "applied",
    changed_paths: [],
    message: "Applied.",
    ...overrides,
  };
}

describe("syncLeadCandidates", () => {
  it("[AC-34] sends a receipt apply item with raw Priority, separate user/rep, and no quoted patch", async () => {
    const applyFormLead = vi.fn(async (_id: string, item: ExtensionGranotApplyItem) =>
      makeApplyResult({ operation_id: item.operation_id }),
    );
    const results: Record<string, RowSyncResult> = {};
    const store = createMemoryPendingStore();

    const counts = await syncLeadCandidates(
      [makeRow()],
      new Map([["row-1", makePreview()]]),
      { applyFormLead, store },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(applyFormLead).toHaveBeenCalledOnce();
    const [id, item] = applyFormLead.mock.calls[0];
    expect(id).toBe("lead-1");
    expect(item.operation_kind).toBe("lead_snapshot_apply");
    expect(item.expected_target).toEqual({ model: "FormLead", id: "lead-1" });
    expect(item.granot_statement).toMatchObject({
      ref_no: "G-100",
      priority: "1",
      user: "MIKEM",
      rep: "SALES1",
      customer: "Pat Example",
    });
    expect(item.granot_statement).not.toHaveProperty("quoted");
    expect(item.granot_statement).not.toHaveProperty("cubic_feet");
    expect(item.granot_statement).not.toHaveProperty("receiver_agent");
    expect(results["row-1"].status).toBe("updated");
    expect(counts).toEqual({ updated: 1, unchanged: 0, failed: 0 });
  });

  it("sends booking_action_apply with raw Booked evidence for Booked Jobs rows", async () => {
    const applyFormLead = vi.fn(async (_id: string, item: ExtensionGranotApplyItem) =>
      makeApplyResult({
        operation_id: item.operation_id,
        outcome: "already_current",
        message: "Already current.",
      }),
    );

    await syncLeadCandidates(
      [makeRow({ tableSource: "bookedJobs" })],
      new Map([["row-1", makePreview()]]),
      { applyFormLead, store: createMemoryPendingStore() },
      () => undefined,
    );

    const item = applyFormLead.mock.calls[0][1];
    expect(item.operation_kind).toBe("booking_action_apply");
    expect(item.granot_statement.event_type).toBe("Booked");
    expect(item.granot_statement.priority).toBe("1");
    expect(item.granot_statement).not.toHaveProperty("quoted");
  });

  it("maps already_current to unchanged and accepted_for_processing to pending reuse", async () => {
    const applyFormLead = vi.fn(async (_id: string, item: ExtensionGranotApplyItem) =>
      makeApplyResult({
        operation_id: item.operation_id,
        processing_state: "accepted_for_processing",
        message: "Accepted for processing.",
      }),
    );
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeRow()],
      new Map([["row-1", makePreview()]]),
      { applyFormLead, store: createMemoryPendingStore() },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(results["row-1"].status).toBe("skipped");
    expect(counts).toEqual({ updated: 0, unchanged: 1, failed: 0 });
  });

  it("skips rows that are not selected for apply", async () => {
    const applyFormLead = vi.fn();
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeRow({ status: "invalid_ref_no", quoted: undefined })],
      new Map(),
      { applyFormLead },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(applyFormLead).not.toHaveBeenCalled();
    expect(results["row-1"].status).toBe("skipped");
    expect(counts).toEqual({ updated: 0, unchanged: 0, failed: 0 });
  });

  it("fails closed when preview did not resolve a Vantage form lead", async () => {
    const applyFormLead = vi.fn();
    const results: Record<string, RowSyncResult> = {};

    const counts = await syncLeadCandidates(
      [makeRow()],
      new Map([
        [
          "row-1",
          makePreview({
            state: "will_update",
            resolvedVantageId: undefined,
            current: undefined,
            matchMethod: "ref_no_exact",
          }),
        ],
      ]),
      { applyFormLead },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(applyFormLead).not.toHaveBeenCalled();
    expect(results["row-1"].status).toBe("skipped");
    expect(counts.failed).toBe(0);
  });

  it("counts an API failure as failed", async () => {
    const results: Record<string, RowSyncResult> = {};
    const counts = await syncLeadCandidates(
      [makeRow()],
      new Map([["row-1", makePreview()]]),
      {
        applyFormLead: async () => {
          throw new Error("boom");
        },
        store: createMemoryPendingStore(),
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
