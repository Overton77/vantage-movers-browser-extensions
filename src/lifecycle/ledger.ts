import type { PendingGranotOperation } from "./types";

export const PENDING_GRANOT_OPERATIONS_KEY = "granot-sync:pending-granot-operations-v1";
export const PENDING_OPERATION_MAX_ENTRIES = 500;
export const PENDING_OPERATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingOperationStore = {
  load(): Promise<unknown>;
  save(rows: PendingGranotOperation[]): Promise<void>;
};

export function createBrowserPendingStore(): PendingOperationStore {
  return {
    async load() {
      const stored = await browser.storage.local.get(PENDING_GRANOT_OPERATIONS_KEY);
      return stored?.[PENDING_GRANOT_OPERATIONS_KEY];
    },
    async save(rows) {
      await browser.storage.local.set({ [PENDING_GRANOT_OPERATIONS_KEY]: rows });
    },
  };
}

export function createMemoryPendingStore(
  initial: PendingGranotOperation[] = [],
): PendingOperationStore & { rows: PendingGranotOperation[] } {
  const state = { rows: [...initial] };
  return {
    get rows() {
      return state.rows;
    },
    async load() {
      return state.rows;
    },
    async save(rows) {
      state.rows = [...rows];
    },
  };
}

export function parsePendingOperations(raw: unknown): PendingGranotOperation[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isPendingOperation);
}

export function prunePendingOperations(
  rows: PendingGranotOperation[],
  now: Date,
): PendingGranotOperation[] {
  const cutoff = now.getTime() - PENDING_OPERATION_MAX_AGE_MS;
  return [...rows]
    .filter((row) => Date.parse(row.created_at) >= cutoff)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
    .slice(-PENDING_OPERATION_MAX_ENTRIES);
}

export function pendingDiagnosticCount(rows: PendingGranotOperation[]): number {
  return rows.length;
}

export function findPendingByFingerprint(
  rows: PendingGranotOperation[],
  fingerprint: string,
): PendingGranotOperation | undefined {
  return rows.find((row) => row.row_fingerprint === fingerprint);
}

export function upsertPendingOperation(
  rows: PendingGranotOperation[],
  next: PendingGranotOperation,
): PendingGranotOperation[] {
  const remaining = rows.filter((row) => row.row_fingerprint !== next.row_fingerprint);
  return [...remaining, next];
}

export function removePendingOperation(
  rows: PendingGranotOperation[],
  operationId: string,
): PendingGranotOperation[] {
  return rows.filter((row) => row.operation_id !== operationId);
}

function isPendingOperation(value: unknown): value is PendingGranotOperation {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.operation_id === "string" &&
    typeof row.row_fingerprint === "string" &&
    (row.operation_kind === "lead_snapshot_apply" ||
      row.operation_kind === "booking_action_apply") &&
    typeof row.created_at === "string" &&
    typeof row.attempt_count === "number" &&
    !containsCustomerText(row)
  );
}

function containsCustomerText(row: Record<string, unknown>): boolean {
  return ["granot_statement", "customer", "phone", "email", "source", "job_no", "ref_no"].some(
    (key) => key in row,
  );
}
