import { applyQueuedItems, type QueueApplyInput } from "../../lifecycle/apply";
import { mapCallLeadUiStatus } from "../../lifecycle/messages";
import {
  buildCallLeadStatement,
  statementHasQuoted,
} from "../../lifecycle/statement";
import type { PendingOperationStore } from "../../lifecycle/ledger";
import type {
  ExtensionGranotApplyItem,
  ExtensionGranotApplyResult,
} from "../../lifecycle/types";
import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
} from "../../utils/api";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
  CallLeadPreviewRow,
} from "./types";

export type CallLeadApplyContext = {
  applyItems: (
    items: ExtensionGranotApplyItem[],
  ) => Promise<ExtensionGranotApplyResult[]>;
  store?: PendingOperationStore;
};

export async function applyCallLeadEnrichmentRows(
  rows: CallLeadEnrichmentPreview[],
  context: CallLeadApplyContext,
): Promise<CallLeadEnrichmentResult[]> {
  return applyCallLeadRows(rows, "lead_snapshot_apply", context);
}

export async function applyBookedCallLeadRows(
  rows: BookedCallLeadReconciliationPreview[],
  context: CallLeadApplyContext,
): Promise<BookedCallLeadReconciliationResult[]> {
  return applyCallLeadRows(rows, "booking_action_apply", context);
}

async function applyCallLeadRows(
  rows: Array<CallLeadEnrichmentPreview | BookedCallLeadReconciliationPreview>,
  operation_kind: "lead_snapshot_apply" | "booking_action_apply",
  context: CallLeadApplyContext,
): Promise<Array<CallLeadEnrichmentResult & BookedCallLeadReconciliationResult>> {
  const queues: QueueApplyInput[] = [];
  const prepared: Array<{
    row_id: string;
    queue?: QueueApplyInput;
    local?: CallLeadEnrichmentResult & BookedCallLeadReconciliationResult;
  }> = [];

  for (const preview of rows) {
    const row_id = preview.payload.row_id;
    const sourceRow = requireSourceRow(preview);
    if (!sourceRow) {
      prepared.push({
        row_id,
        local: localFailure(row_id, "Raw Granot row is required for receipt apply."),
      });
      continue;
    }
    const statement = buildCallLeadStatement(sourceRow, operation_kind);
    if (statementHasQuoted(statement)) {
      prepared.push({
        row_id,
        local: localFailure(row_id, "Final apply cannot send a quoted patch."),
      });
      continue;
    }
    const queue: QueueApplyInput = {
      row_id,
      operation_kind,
      granot_statement: statement,
      expected_target: callLeadExpectedTarget(preview),
    };
    prepared.push({ row_id, queue });
    queues.push(queue);
  }

  const sent =
    queues.length > 0
      ? await applyQueuedItems({
          queues,
          store: context.store,
          send: context.applyItems,
        })
      : [];

  let sentIndex = 0;
  return prepared.map((entry) => {
    if (entry.local) {
      return entry.local;
    }
    const result = sent[sentIndex];
    sentIndex += 1;
    return mapApplyToCallResult(entry.row_id, result);
  });
}

function requireSourceRow(
  preview: CallLeadEnrichmentPreview | BookedCallLeadReconciliationPreview,
): CallLeadPreviewRow | undefined {
  return preview.sourceRow;
}

function callLeadExpectedTarget(
  preview: CallLeadEnrichmentPreview | BookedCallLeadReconciliationPreview,
): { model: "CallLead"; id: string } | undefined {
  const id = preview.result?.call_lead_id;
  return id ? { model: "CallLead", id } : undefined;
}

function mapApplyToCallResult(
  row_id: string,
  result: ExtensionGranotApplyResult,
): CallLeadEnrichmentResult & BookedCallLeadReconciliationResult {
  return {
    row_id,
    status: mapCallLeadUiStatus(result),
    message: result.message,
    call_lead_id: result.target?.model === "CallLead" ? result.target.id : undefined,
    changes: result.changed_paths,
    warnings: [],
  };
}

function localFailure(
  row_id: string,
  message: string,
): CallLeadEnrichmentResult & BookedCallLeadReconciliationResult {
  return {
    row_id,
    status: "failed",
    message,
    changes: [],
    warnings: [],
  };
}
