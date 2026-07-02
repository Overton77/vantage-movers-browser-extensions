// Form Leads sync workflow. Loops a list of sync candidates, decides whether to
// send a real diff (`PATCH` of changed fields) or an idempotent re-sync, and
// reports each row result back through `onResult`. Returns aggregate counts.
// API access is injected so the same logic can run from the popup or a future
// background runner.
import type { Agent } from "../../api/agents";
import type { FormLeadLookup, FormLeadUpdatePayload } from "../../utils/api";
import { matchAgentByCrmUsername } from "../agents/match";
import {
  buildFormLeadSyncPayload,
  buildFormLeadUpdatePayload,
  buildUnchangedMessage,
  buildUpdatedMessage,
  isDuplicateQuarantineLead,
} from "./payloads";
import type { LeadSyncCandidate, RowSyncResult, SyncCounts } from "./types";

export type FormLeadSyncContext = {
  getFormLeadById: (id: string) => Promise<FormLeadLookup>;
  updateFormLead: (
    id: string,
    payload: FormLeadUpdatePayload,
  ) => Promise<FormLeadLookup>;
  agents?: Agent[];
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

    // Use the resolved Vantage `_id` for fallback matches; falls back to the
    // Granot `refNo` for direct id matches. Never PATCH the Granot refNo string
    // once a fallback match has resolved a different Vantage id.
    const targetId = candidate.vantageId ?? candidate.refNo;

    try {
      const current = await context.getFormLeadById(targetId);
      if (isDuplicateQuarantineLead(current)) {
        onResult(candidate.id, {
          status: "skipped",
          message:
            "Skipped duplicate quarantined form lead — sync only applies to the canonical lead.",
        });
        continue;
      }

      const receiverMatch = buildReceiverAgentUpdate(candidate, current, context.agents);
      const updatePayload = {
        ...buildFormLeadUpdatePayload(candidate, current),
        ...receiverMatch.payload,
      };
      const syncPayload =
        Object.keys(updatePayload).length > 0
          ? updatePayload
          : buildFormLeadSyncPayload(candidate);
      await context.updateFormLead(targetId, syncPayload);

      if (Object.keys(updatePayload).length === 0) {
        unchanged += 1;
        onResult(candidate.id, {
          status: "unchanged",
          message: appendReceiverMessage(
            `${buildUnchangedMessage(candidate)}; sync request sent anyway.`,
            receiverMatch.message,
          ),
        });
      } else {
        updated += 1;
        onResult(candidate.id, {
          status: "updated",
          message: appendReceiverMessage(
            buildUpdatedMessage(updatePayload),
            receiverMatch.message,
          ),
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

function buildReceiverAgentUpdate(
  candidate: LeadSyncCandidate,
  current: FormLeadLookup,
  agents: Agent[] | undefined,
): { payload?: FormLeadUpdatePayload; message?: string } {
  const match = matchAgentByCrmUsername(candidate.salesRepRaw, agents ?? []);
  if (!match.username) {
    return {};
  }

  if (current.receiver_agent) {
    return {
      message: `Receiver Agent already set; CRM username ${match.username} did not overwrite it.`,
    };
  }

  if (match.status === "none") {
    return {
      message: `No Agent matched CRM username ${match.username}.`,
    };
  }

  const activeLabel = match.candidate.active ? "active" : "inactive";
  return {
    payload: {
      receiver_agent: match.candidate._id,
      receiver_agent_source: "extension_crm_username_match",
      receiver_agent_source_value: match.username,
    },
    message: `Matched ${activeLabel} Agent "${match.candidate.name}" by CRM username ${match.username}.`,
  };
}

function appendReceiverMessage(message: string, receiverMessage: string | undefined): string {
  return receiverMessage ? `${message} ${receiverMessage}` : message;
}
