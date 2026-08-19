import { describe, expect, it } from "vitest";

import {
  PENDING_OPERATION_MAX_AGE_MS,
  PENDING_OPERATION_MAX_ENTRIES,
  createMemoryPendingStore,
  parsePendingOperations,
  pendingDiagnosticCount,
  prunePendingOperations,
} from "../lifecycle/ledger";
import type { PendingGranotOperation } from "../lifecycle/types";

function pending(
  overrides: Partial<PendingGranotOperation> = {},
): PendingGranotOperation {
  return {
    operation_id: "11111111-1111-4111-8111-111111111111",
    row_fingerprint: "abc123",
    operation_kind: "lead_snapshot_apply",
    created_at: "2026-08-18T12:00:00.000Z",
    attempt_count: 1,
    ...overrides,
  };
}

describe("pending ledger [AC-35] [AC-34]", () => {
  it("stores only PII-free operation fields and exposes a numeric diagnostic count", () => {
    const store = createMemoryPendingStore([pending()]);
    expect(Object.keys(store.rows[0]).sort()).toEqual([
      "attempt_count",
      "created_at",
      "operation_id",
      "operation_kind",
      "row_fingerprint",
    ]);
    expect(JSON.stringify(store.rows)).not.toMatch(/Pat|555|example\.test|Top10|P100/);
    expect(pendingDiagnosticCount(store.rows)).toBe(1);
  });

  it("rejects records that carry customer or statement fields", () => {
    expect(
      parsePendingOperations([
        {
          ...pending(),
          customer: "Pat Example",
        },
        {
          ...pending(),
          granot_statement: { phone: "555" },
        },
        pending({ operation_id: "22222222-2222-4222-8222-222222222222" }),
      ]),
    ).toEqual([pending({ operation_id: "22222222-2222-4222-8222-222222222222" })]);
  });

  it("prunes oldest-first past seven days and the 500-entry bound", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const stale = pending({
      operation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_at: new Date(now.getTime() - PENDING_OPERATION_MAX_AGE_MS - 1).toISOString(),
      row_fingerprint: "stale",
    });
    const overflow = Array.from({ length: PENDING_OPERATION_MAX_ENTRIES + 3 }, (_, index) =>
      pending({
        operation_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        row_fingerprint: `fp-${index}`,
        created_at: new Date(now.getTime() - index * 1000).toISOString(),
      }),
    );
    const pruned = prunePendingOperations([stale, ...overflow], now);
    expect(pruned).toHaveLength(PENDING_OPERATION_MAX_ENTRIES);
    expect(pruned.some((row) => row.row_fingerprint === "stale")).toBe(false);
    expect(pruned[0].created_at < pruned[pruned.length - 1].created_at).toBe(true);
  });
});
