import { describe, expect, it, vi } from "vitest";

import { applyQueuedItems } from "../lifecycle/apply";
import { createMemoryPendingStore } from "../lifecycle/ledger";
import { mapApplyResultToUiStatus, mapCallLeadUiStatus } from "../lifecycle/messages";
import type {
  ExtensionGranotApplyItem,
  ExtensionGranotApplyResult,
} from "../lifecycle/types";
import type { QueueApplyInput } from "../lifecycle/apply";
import { applyCallLeadEnrichmentRows } from "../workflows/call-leads/apply";
import type { CallLeadEnrichmentPreview } from "../workflows/call-leads/types";

function makeQueue(overrides: Partial<QueueApplyInput> = {}): QueueApplyInput {
  return {
    row_id: "row-1",
    operation_kind: "lead_snapshot_apply",
    granot_statement: {
      source: "Top10",
      job_no: "P100",
      priority: "1",
      user: "MIKEM",
      rep: "SALES1",
    },
    expected_target: { model: "FormLead", id: "lead-1" },
    ...overrides,
  };
}

function okResult(
  operation_id: string,
  overrides: Partial<ExtensionGranotApplyResult> = {},
): ExtensionGranotApplyResult {
  return {
    operation_id,
    receipt_id: "receipt-1",
    processing_state: "completed",
    outcome: "applied",
    changed_paths: [],
    message: "Applied.",
    ...overrides,
  };
}

describe("applyQueuedItems [AC-34]", () => {
  it("persists the UUID before network I/O and reuses it after auth refresh retry", async () => {
    const store = createMemoryPendingStore();
    let attempts = 0;
    const send = vi.fn(async (items: ExtensionGranotApplyItem[]) => {
      expect(store.rows).toHaveLength(1);
      expect(store.rows[0].operation_id).toBe(items[0].operation_id);
      attempts += 1;
      if (attempts === 1) {
        throw new Error("Vantage request failed (401): Unauthorized");
      }
      return [okResult(items[0].operation_id)];
    });

    await expect(
      applyQueuedItems({ queues: [makeQueue()], store, send }),
    ).rejects.toThrow(/401/);

    const retained = store.rows[0].operation_id;
    expect(store.rows[0].attempt_count).toBe(1);

    const results = await applyQueuedItems({
      queues: [makeQueue()],
      store,
      send,
    });
    expect(results[0].operation_id).toBe(retained);
    expect(store.rows).toHaveLength(0);
    expect(send.mock.calls[1][0][0].operation_id).toBe(retained);
  });

  it("reuses the same ID after a restart from the pending ledger", async () => {
    const store = createMemoryPendingStore();
    const firstSend = vi.fn(async (items: ExtensionGranotApplyItem[]) => {
      throw new Error("network down");
    });
    await expect(
      applyQueuedItems({ queues: [makeQueue()], store, send: firstSend }),
    ).rejects.toThrow(/network down/);
    const retained = store.rows[0].operation_id;

    const restarted = createMemoryPendingStore(store.rows);
    const secondSend = vi.fn(async (items: ExtensionGranotApplyItem[]) => [
      okResult(items[0].operation_id, {
        processing_state: "accepted_for_processing",
        message: "Accepted for processing.",
      }),
    ]);
    const pending = await applyQueuedItems({
      queues: [makeQueue()],
      store: restarted,
      send: secondSend,
    });
    expect(pending[0].operation_id).toBe(retained);
    expect(restarted.rows[0].operation_id).toBe(retained);
    expect(restarted.rows[0].attempt_count).toBe(2);
  });

  it("issues a new ID for a deliberate later apply after a terminal result", async () => {
    const store = createMemoryPendingStore();
    let created = 0;
    const createId = () => {
      created += 1;
      return created === 1
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222";
    };
    const send = vi.fn(async (items: ExtensionGranotApplyItem[]) => [
      okResult(items[0].operation_id),
    ]);

    const first = await applyQueuedItems({
      queues: [makeQueue()],
      store,
      send,
      createId,
    });
    const second = await applyQueuedItems({
      queues: [makeQueue()],
      store,
      send,
      createId,
    });
    expect(first[0].operation_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(second[0].operation_id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("assigns a distinct operation ID to each Call batch item", async () => {
    const store = createMemoryPendingStore();
    const send = vi.fn(async (items: ExtensionGranotApplyItem[]) =>
      items.map((item) => okResult(item.operation_id)),
    );
    const results = await applyQueuedItems({
      queues: [
        makeQueue({ row_id: "a" }),
        makeQueue({ row_id: "b" }),
      ],
      store,
      send,
    });
    expect(results).toHaveLength(2);
    expect(results[0].operation_id).not.toBe(results[1].operation_id);
    expect(send.mock.calls[0][0]).toHaveLength(2);
  });
});

describe("response mapping [AC-34]", () => {
  it("maps created/applied/linked to updated and already_current/stale to unchanged", () => {
    expect(
      mapApplyResultToUiStatus(okResult("id", { outcome: "created" })),
    ).toBe("updated");
    expect(
      mapApplyResultToUiStatus(okResult("id", { outcome: "already_current" })),
    ).toBe("unchanged");
    expect(
      mapApplyResultToUiStatus(okResult("id", { outcome: "stale" })),
    ).toBe("unchanged");
    expect(
      mapApplyResultToUiStatus(
        okResult("id", {
          processing_state: "accepted_for_processing",
          outcome: undefined,
        }),
      ),
    ).toBe("skipped");
    expect(mapCallLeadUiStatus(okResult("id", { outcome: "conflict" }))).toBe(
      "conflict",
    );
  });
});

describe("call lead apply adapter [AC-34]", () => {
  it("sends raw Priority, separate user/rep, and no quoted or enrichment DTO", async () => {
    const send = vi.fn(async (items: ExtensionGranotApplyItem[]) => [
      okResult(items[0].operation_id, {
        target: { model: "CallLead", id: "call-1" },
      }),
    ]);
    const rows: CallLeadEnrichmentPreview[] = [
      {
        payload: {
          row_id: "follow-1",
          granot_crm_username: "COLLAPSED",
        },
        sourceRow: {
          id: "follow-1",
          rowIndex: 1,
          values: {
            source: "Top10",
            job_no: "P9",
            prior: "5",
            user: "USER1",
            rep: "REP2",
            customer: "Pat",
          },
        },
        result: { row_id: "follow-1", status: "updateable", message: "", call_lead_id: "call-1", changes: [], warnings: [] },
      },
    ];

    const results = await applyCallLeadEnrichmentRows(rows, {
      applyItems: send,
      store: createMemoryPendingStore(),
    });

    const item = send.mock.calls[0][0][0];
    expect(item.operation_kind).toBe("lead_snapshot_apply");
    expect(item.expected_target).toEqual({ model: "CallLead", id: "call-1" });
    expect(item.granot_statement).toEqual({
      source: "Top10",
      job_no: "P9",
      customer: "Pat",
      priority: "5",
      user: "USER1",
      rep: "REP2",
    });
    expect(item.granot_statement).not.toHaveProperty("quoted");
    expect(item.granot_statement).not.toHaveProperty("granot_crm_username");
    expect(results[0].status).toBe("updated");
  });
});
