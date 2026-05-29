// Form Leads sync workflow. Loops a list of sync candidates, decides whether to
// send a real diff (`PATCH` of changed fields) or an idempotent re-sync, and
// reports each row result back through `onResult`. Returns aggregate counts.
// API access is injected so the same logic can run from the popup or a future
// background runner.
import type { FormLeadLookup, FormLeadUpdatePayload } from "../../utils/api";
import {
  buildFormLeadSyncPayload,
  buildFormLeadUpdatePayload,
  buildUnchangedMessage,
  buildUpdatedMessage,
} from "./payloads";
import type { LeadSyncCandidate, RowSyncResult, SyncCounts } from "./types";

export type FormLeadSyncContext = {
  getFormLeadById: (id: string) => Promise<FormLeadLookup>;
  updateFormLead: (
    id: string,
    payload: FormLeadUpdatePayload,
  ) => Promise<FormLeadLookup>;
};

export async function syncLeadCandidates(
  candidates: LeadSyncCandidate[],
  context: FormLeadSyncContext,
  onResult: (id: string, result: RowSyncResult) => void,
): Promise<SyncCounts> {
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (typeof candidate.quoted !== "boolean") {
      onResult(candidate.id, {
        status: "skipped",
        message: "Missing quoted target",
      });
      continue;
    }

    try {
      const current = await context.getFormLeadById(candidate.refNo);
      const updatePayload = buildFormLeadUpdatePayload(candidate, current);
      const syncPayload =
        Object.keys(updatePayload).length > 0
          ? updatePayload
          : buildFormLeadSyncPayload(candidate);
      await context.updateFormLead(candidate.refNo, syncPayload);

      if (Object.keys(updatePayload).length === 0) {
        unchanged += 1;
        onResult(candidate.id, {
          status: "unchanged",
          message: `${buildUnchangedMessage(candidate)}; sync request sent anyway.`,
        });
      } else {
        updated += 1;
        onResult(candidate.id, {
          status: "updated",
          message: buildUpdatedMessage(updatePayload),
        });
      }
    } catch (err) {
      failed += 1;
      onResult(candidate.id, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { updated, unchanged, failed };
}
