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

      const fieldUpdates = buildFormLeadUpdatePayload(candidate, current);
      const receiverMatch = buildReceiverAgentUpdate(
        candidate,
        current,
        context.agents,
      );
      const changedPayload: FormLeadUpdatePayload = {
        ...fieldUpdates,
        ...(receiverMatch.payload ?? {}),
      };
      const hasChanges = Object.keys(changedPayload).length > 0;
      const hasLeadFieldSyncTarget = typeof candidate.quoted === "boolean";

      if (!hasChanges && !hasLeadFieldSyncTarget) {
        onResult(candidate.id, {
          status: "skipped",
          message: appendReceiverMessage(
            "Missing quoted target",
            receiverMatch.message,
          ),
        });
        continue;
      }

      const syncPayload: FormLeadUpdatePayload = {
        ...(hasLeadFieldSyncTarget ? buildFormLeadSyncPayload(candidate) : {}),
        ...fieldUpdates,
        ...(receiverMatch.payload ?? {}),
      };
      const updatedCurrent = reflectReceiverAgentUpdate(
        await context.updateFormLead(targetId, syncPayload),
        receiverMatch,
      );

      if (!hasChanges) {
        unchanged += 1;
        onResult(candidate.id, {
          status: "unchanged",
          message: appendReceiverMessage(
            `${buildUnchangedMessage(candidate)}; sync request sent anyway.`,
            receiverMatch.message,
          ),
          current: updatedCurrent,
        });
      } else {
        updated += 1;
        onResult(candidate.id, {
          status: "updated",
          message: appendReceiverMessage(
            buildUpdatedMessage(changedPayload),
            receiverMatch.message,
          ),
          current: updatedCurrent,
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
): {
  payload?: FormLeadUpdatePayload;
  message?: string;
  agentName?: string;
  crmUsername?: string;
} {
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
      crmUsername: match.username,
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
    agentName: match.candidate.name,
    crmUsername: match.username,
  };
}

function appendReceiverMessage(message: string, receiverMessage: string | undefined): string {
  return receiverMessage ? `${message} ${receiverMessage}` : message;
}

function reflectReceiverAgentUpdate(
  lead: FormLeadLookup,
  receiverMatch: { agentName?: string; crmUsername?: string },
): FormLeadLookup {
  if (!receiverMatch.agentName) {
    return lead;
  }
  return {
    ...lead,
    receiver_agent_name_snapshot:
      lead.receiver_agent_name_snapshot ?? receiverMatch.agentName,
    receiver_agent_source_value:
      lead.receiver_agent_source_value ?? receiverMatch.crmUsername,
  };
}
