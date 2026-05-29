// Background auto-sync runner. Runs unattended Scan-and-Sync cycles from the
// service worker by reusing the already-extracted workflow + API + messaging
// modules. It deliberately imports NO popup render/state code: it reads
// settings, acquires a lock, resolves the pinned Granot tab, sends parser
// messages to the content script, calls the workflow preview/sync modules, and
// stores the cycle result. Added in Unit 08.
//
// Safety posture (see Unit 08 docs):
//   - disabled + preview-only by default; sync only when previewOnly is false
//   - missing expected tables  -> `skipped` cycle (not fatal)
//   - no content-script response -> `failed` cycle with reload guidance
//   - booked call reconciliation only runs behind its explicit setting
//   - overlapping cycles are prevented by the storage lock
import {
  getFormLeadById,
  previewBookedCallLeadReconciliation,
  previewCallLeadEnrichment,
  syncBookedCallLeadReconciliation,
  syncCallLeadEnrichment,
  updateFormLead,
} from "../utils/api";
import type { ListWorkspaceId } from "../app/state";
import {
  isSyncableRow,
  rowToSyncCandidate,
} from "../workflows/form-leads/payloads";
import { previewFormLeadRows } from "../workflows/form-leads/preview";
import { syncLeadCandidates } from "../workflows/form-leads/sync";
import type {
  FollowUpRow,
  FormLeadRowPreview,
  ParseResponse,
  RowSyncResult,
} from "../workflows/form-leads/types";
import {
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../workflows/call-leads/payloads";
import { previewCallLeads } from "../workflows/call-leads/preview";
import {
  countBookedReconciliationResults,
  countEnrichmentResults,
  mergeBookedReconciliationResults,
  mergeEnrichmentResults,
} from "../workflows/call-leads/sync";
import type { CallLeadPreviewResponse } from "../workflows/call-leads/types";
import { sendActiveTabMessage } from "../messaging/tabs";
import {
  buildCycleSummary,
  callEnrichmentRowToCycleDetail,
  followUpRowToCycleDetail,
  type CycleDetail,
} from "./cycles";
import {
  acquireLock,
  releaseLock,
} from "./locks";
import {
  loadAutomatedSyncSettings,
  type AutomatedSyncSettings,
} from "./settings";
import {
  appendBackgroundCycle,
  type BackgroundCycle,
  type BackgroundCycleStatus,
} from "./storage";

type ResolvedTarget = {
  tabId: number;
  url?: string;
};

type CycleDraft = {
  status: BackgroundCycleStatus;
  message: string;
  details: CycleDetail[];
};

/**
 * Runs one background pass for every enabled workflow. Safe to call from an
 * alarm handler: it no-ops when automation is disabled and refuses to overlap
 * with an in-flight cycle.
 */
export async function runBackgroundAutoSync(
  now: () => Date = () => new Date(),
): Promise<void> {
  const settings = await loadAutomatedSyncSettings();
  if (!settings.enabled) {
    return;
  }

  const gotLock = await acquireLock(now().getTime());
  if (!gotLock) {
    console.warn("[Granot Sync] Auto-sync cycle skipped — lock held.");
    return;
  }

  try {
    const target = await resolveTargetTab(settings);

    if (settings.workflows.formLeads) {
      await runWorkflowCycle("form-leads", settings, target, now, () =>
        runFormLeadsCycle(settings, target!),
      );
    }

    if (
      settings.workflows.callLeadEnrichment ||
      settings.workflows.bookedCallReconciliation
    ) {
      await runWorkflowCycle("call-leads", settings, target, now, () =>
        runCallLeadsCycle(settings, target!),
      );
    }
  } finally {
    await releaseLock();
  }
}

/**
 * Wraps a single workflow cycle: short-circuits to a `skipped` record when no
 * target tab is configured, runs the workflow body otherwise, converts thrown
 * errors into a `failed` record, and always stores the cycle.
 */
async function runWorkflowCycle(
  workflow: ListWorkspaceId,
  settings: AutomatedSyncSettings,
  target: ResolvedTarget | undefined,
  now: () => Date,
  body: () => Promise<CycleDraft>,
): Promise<void> {
  const startedAt = now().toISOString();
  let draft: CycleDraft;

  if (!target) {
    draft = {
      status: "skipped",
      message:
        "No Granot target tab configured or the pinned tab is gone. Open the popup and pin the current Granot tab.",
      details: [],
    };
  } else {
    try {
      draft = await body();
    } catch (err) {
      draft = {
        status: "failed",
        message: `Cycle crashed: ${err instanceof Error ? err.message : String(err)}`,
        details: [],
      };
    }
  }

  const cycle: BackgroundCycle = {
    id: `${workflow}:${Date.now()}:${Math.random()}`,
    workflow,
    status: draft.status,
    startedAt,
    finishedAt: now().toISOString(),
    message: draft.message,
    targetTabId: target?.tabId,
    targetUrl: target?.url,
    previewOnly: settings.safety.previewOnly,
    details: draft.details,
  };
  await appendBackgroundCycle(cycle);
}

async function resolveTargetTab(
  settings: AutomatedSyncSettings,
): Promise<ResolvedTarget | undefined> {
  if (typeof settings.targetTabId !== "number") {
    return undefined;
  }
  try {
    const tab = await browser.tabs.get(settings.targetTabId);
    if (!tab?.id) {
      return undefined;
    }
    return { tabId: tab.id, url: tab.url };
  } catch {
    return undefined;
  }
}

/* ============================================================================
 * Form Leads cycle
 * ========================================================================== */

async function runFormLeadsCycle(
  settings: AutomatedSyncSettings,
  target: ResolvedTarget,
): Promise<CycleDraft> {
  const response = await sendActiveTabMessage<ParseResponse>(
    { type: "PARSE_FOLLOW_UP_ROWS" },
    target.tabId,
  );

  if ((response?.frameResponses ?? 0) === 0) {
    return {
      status: "failed",
      message:
        "Content script did not respond in any frame. Reload the Granot tab so the parser is reachable.",
      details: [],
    };
  }

  if (!response?.tableFound) {
    return {
      status: "skipped",
      message: "No Booked Jobs or Follow Up Estimates table on the target tab.",
      details: [],
    };
  }

  const rows = response.rows;
  const syncableRows = rows.filter(isSyncableRow);

  if (settings.safety.previewOnly) {
    const previews = await previewFormLeadRows(rows, { getFormLeadById });
    const details = rows.map((row) =>
      formLeadPreviewToDetail(row, previews.get(row.id)),
    );
    return {
      status: "ok",
      message: `Form Leads (preview): ${rows.length} row(s), ${syncableRows.length} syncable — no writes performed.`,
      details,
    };
  }

  const candidates = syncableRows.map(rowToSyncCandidate);
  const resultsById = new Map<string, RowSyncResult>();
  const counts = await syncLeadCandidates(
    candidates,
    { getFormLeadById, updateFormLead },
    (id, result) => {
      resultsById.set(id, result);
    },
  );

  const unsyncableRows = rows.filter((row) => !isSyncableRow(row));
  const details: CycleDetail[] = [
    ...syncableRows.map((row) =>
      followUpRowToCycleDetail(row, resultsById.get(row.id)),
    ),
    ...unsyncableRows.map((row) => followUpRowToCycleDetail(row)),
  ];

  return {
    status: counts.failed === 0 ? "ok" : "failed",
    message: buildCycleSummary("Form Leads", syncableRows.length, counts),
    details,
  };
}

function formLeadPreviewToDetail(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
): CycleDetail {
  const rowLabel = `#${row.displayNumber || row.rowIndex} ${
    row.customer || "Unknown customer"
  }`;
  if (!preview) {
    return {
      rowId: row.id,
      rowLabel,
      status: "skipped",
      message: `[preview] ${row.reason ?? row.status}`,
    };
  }
  const status: CycleDetail["status"] =
    preview.state === "not_found" || preview.state === "preview_error"
      ? "failed"
      : "skipped";
  return {
    rowId: row.id,
    rowLabel,
    status,
    message: `[preview] ${preview.message}`,
  };
}

/* ============================================================================
 * Call Leads cycle (enrichment + booked reconciliation behind their settings)
 * ========================================================================== */

async function runCallLeadsCycle(
  settings: AutomatedSyncSettings,
  target: ResolvedTarget,
): Promise<CycleDraft> {
  const response = await sendActiveTabMessage<CallLeadPreviewResponse>(
    { type: "PARSE_CALL_LEAD_TABLES" },
    target.tabId,
  );

  if ((response?.frameResponses ?? 0) === 0) {
    return {
      status: "failed",
      message:
        "Content script did not respond in any frame. Reload the Granot tab so the parser is reachable.",
      details: [],
    };
  }

  if (!response?.pageFound) {
    return {
      status: "skipped",
      message: "No Booked Jobs or Follow Up Estimates tables on the target tab.",
      details: [],
    };
  }

  const outcome = await previewCallLeads(response, {
    previewEnrichment: previewCallLeadEnrichment,
    previewBookedReconciliation: previewBookedCallLeadReconciliation,
  });

  if (outcome.enrichmentError || outcome.bookedError) {
    return {
      status: "failed",
      message: `Call lead preview failed: ${
        outcome.enrichmentError ?? outcome.bookedError
      }`,
      details: [],
    };
  }

  if (settings.safety.previewOnly) {
    const updateableEnrichment = outcome.enrichmentRows.filter(
      canSyncCallEnrichmentRow,
    ).length;
    const updateableBooked = outcome.bookedReconciliationRows.filter(
      canSyncBookedCallReconciliationRow,
    ).length;
    return {
      status: "ok",
      message: `Call Leads (preview): ${outcome.enrichmentRows.length} follow-up row(s), ${updateableEnrichment} updateable, ${updateableBooked} booked updateable — no writes performed.`,
      details: outcome.enrichmentRows.map(callEnrichmentRowToCycleDetail),
    };
  }

  const details: CycleDetail[] = [];
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let syncableTotal = 0;

  if (settings.workflows.callLeadEnrichment) {
    const syncable = outcome.enrichmentRows.filter(canSyncCallEnrichmentRow);
    syncableTotal += syncable.length;
    if (syncable.length > 0) {
      const results = await syncCallLeadEnrichment(
        syncable.map((row) => row.payload),
      );
      const merged = mergeEnrichmentResults(outcome.enrichmentRows, results);
      const counts = countEnrichmentResults(results);
      updated += counts.updated;
      unchanged += counts.unchanged;
      failed += counts.failed;
      details.push(...merged.map(callEnrichmentRowToCycleDetail));
    }
  }

  if (settings.workflows.bookedCallReconciliation) {
    const syncable = outcome.bookedReconciliationRows.filter(
      canSyncBookedCallReconciliationRow,
    );
    syncableTotal += syncable.length;
    if (syncable.length > 0) {
      const results = await syncBookedCallLeadReconciliation(
        syncable.map((row) => row.payload),
      );
      mergeBookedReconciliationResults(outcome.bookedReconciliationRows, results);
      const counts = countBookedReconciliationResults(results);
      updated += counts.updated;
      unchanged += counts.unchanged;
      failed += counts.failed;
    }
  }

  return {
    status: failed === 0 ? "ok" : "failed",
    message: buildCycleSummary("Call Leads", syncableTotal, {
      updated,
      unchanged,
      failed,
    }),
    details,
  };
}
