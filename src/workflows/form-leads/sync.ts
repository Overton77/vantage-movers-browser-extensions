import type { ExtensionGranotApplyItem, ExtensionGranotApplyResult } from "../../lifecycle/types";
import { applyQueuedItems, type QueueApplyInput } from "../../lifecycle/apply";
import { mapApplyResultToUiStatus } from "../../lifecycle/messages";
import {
  buildFormLeadStatement,
  formLeadOperationKind,
  statementHasQuoted,
} from "../../lifecycle/statement";
import type { PendingOperationStore } from "../../lifecycle/ledger";
import { isRowSyncable } from "./payloads";
import type {
  FollowUpRow,
  FormLeadRowPreview,
  RowSyncResult,
  SyncCounts,
} from "./types";

export type FormLeadSyncContext = {
  applyFormLead: (
    id: string,
    item: ExtensionGranotApplyItem,
  ) => Promise<ExtensionGranotApplyResult>;
  store?: PendingOperationStore;
};

export async function syncLeadCandidates(
  rows: FollowUpRow[],
  previews: ReadonlyMap<string, FormLeadRowPreview>,
  context: FormLeadSyncContext,
  onResult: (id: string, result: RowSyncResult) => void,
): Promise<SyncCounts> {
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const row of rows) {
    const preview = previews.get(row.id);
    if (!isRowSyncable(row, preview)) {
      onResult(row.id, {
        status: "skipped",
        message: "Row is not selected for apply.",
      });
      continue;
    }
    const targetId = preview?.resolvedVantageId ?? preview?.current?._id;
    if (!targetId) {
      failed += 1;
      onResult(row.id, {
        status: "failed",
        message: "Preview did not resolve a Vantage form lead.",
      });
      continue;
    }

    const statement = buildFormLeadStatement(row);
    if (statementHasQuoted(statement)) {
      failed += 1;
      onResult(row.id, {
        status: "failed",
        message: "Final apply cannot send a quoted patch.",
      });
      continue;
    }

    try {
      const queue: QueueApplyInput = {
        row_id: row.id,
        operation_kind: formLeadOperationKind(row),
        granot_statement: statement,
        expected_target: { model: "FormLead", id: targetId },
      };
      const [result] = await applyQueuedItems({
        queues: [queue],
        store: context.store,
        send: async (items) => [await context.applyFormLead(targetId, items[0])],
      });
      const status = mapApplyResultToUiStatus(result);
      if (status === "updated") updated += 1;
      else if (status === "unchanged" || status === "skipped") unchanged += 1;
      else failed += 1;
      onResult(row.id, {
        status,
        message: result.message,
        current: preview?.current,
      });
    } catch (err) {
      failed += 1;
      onResult(row.id, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { updated, unchanged, failed };
}
