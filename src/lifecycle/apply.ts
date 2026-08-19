import { fingerprintPendingRow } from "./fingerprint";
import {
  createBrowserPendingStore,
  findPendingByFingerprint,
  parsePendingOperations,
  pendingDiagnosticCount,
  prunePendingOperations,
  removePendingOperation,
  upsertPendingOperation,
  type PendingOperationStore,
} from "./ledger";
import { isTerminalApplyResult } from "./messages";
import type {
  ChannelOperationKind,
  ExtensionGranotApplyItem,
  ExtensionGranotApplyResult,
  PendingGranotOperation,
} from "./types";
import { generateOperationId } from "./uuid";

export type QueueApplyInput = {
  row_id: string;
  operation_kind: ChannelOperationKind;
  granot_statement: Record<string, string | number | null>;
  expected_target?: { model: "FormLead" | "CallLead"; id: string };
};

export async function retainOrCreateOperationId(input: {
  queue: QueueApplyInput;
  store?: PendingOperationStore;
  now?: () => Date;
  createId?: () => string;
}): Promise<{ item: ExtensionGranotApplyItem; pending: PendingGranotOperation }> {
  const store = input.store ?? createBrowserPendingStore();
  const now = input.now ?? (() => new Date());
  const fingerprint = await fingerprintPendingRow({
    operation_kind: input.queue.operation_kind,
    row_id: input.queue.row_id,
    expected_target: input.queue.expected_target,
    granot_statement: input.queue.granot_statement,
  });
  const existing = prunePendingOperations(
    parsePendingOperations(await store.load()),
    now(),
  );
  const reused = findPendingByFingerprint(existing, fingerprint);
  const pending: PendingGranotOperation = reused
    ? {
        ...reused,
        attempt_count: reused.attempt_count + 1,
      }
    : {
        operation_id: (input.createId ?? generateOperationId)(),
        row_fingerprint: fingerprint,
        operation_kind: input.queue.operation_kind,
        created_at: now().toISOString(),
        attempt_count: 1,
      };
  await store.save(upsertPendingOperation(existing, pending));
  return {
    pending,
    item: {
      operation_id: pending.operation_id,
      operation_kind: input.queue.operation_kind,
      granot_statement: input.queue.granot_statement,
      expected_target: input.queue.expected_target,
    },
  };
}

export async function finalizePendingOperation(input: {
  operation_id: string;
  result?: ExtensionGranotApplyResult;
  store?: PendingOperationStore;
  now?: () => Date;
}): Promise<number> {
  const store = input.store ?? createBrowserPendingStore();
  const now = input.now ?? (() => new Date());
  const existing = prunePendingOperations(
    parsePendingOperations(await store.load()),
    now(),
  );
  const next =
    input.result && isTerminalApplyResult(input.result)
      ? removePendingOperation(existing, input.operation_id)
      : existing;
  await store.save(next);
  return pendingDiagnosticCount(next);
}

export async function applyQueuedItems(input: {
  queues: QueueApplyInput[];
  send: (items: ExtensionGranotApplyItem[]) => Promise<ExtensionGranotApplyResult[]>;
  store?: PendingOperationStore;
  now?: () => Date;
  createId?: () => string;
}): Promise<ExtensionGranotApplyResult[]> {
  const prepared = [];
  for (const queue of input.queues) {
    prepared.push(
      await retainOrCreateOperationId({
        queue,
        store: input.store,
        now: input.now,
        createId: input.createId,
      }),
    );
  }
  const results = await input.send(prepared.map((entry) => entry.item));
  for (const result of results) {
    await finalizePendingOperation({
      operation_id: result.operation_id,
      result,
      store: input.store,
      now: input.now,
    });
  }
  return results;
}
