// Call Leads workspace actions. Thin popup orchestration around the extracted
// Call Leads workflow: scan the Granot tables, run the server preview, and sync
// enrichment / booked-reconciliation rows. Matching policy stays server-side;
// these actions only own popup status/busy/state/render side effects. Extracted
// from `popup/main.ts` in Unit 07.
import {
  previewBookedCallLeadReconciliation,
  previewCallLeadEnrichment,
  syncBookedCallLeadReconciliation,
  syncCallLeadEnrichment,
  type BookedCallLeadReconciliationRowPayload,
  type CallLeadEnrichmentRowPayload,
} from "../../../../utils/api";
import {
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../../../../workflows/call-leads/payloads";
import { previewCallLeads } from "../../../../workflows/call-leads/preview";
import {
  countBookedReconciliationResults,
  countEnrichmentResults,
  mergeBookedReconciliationResults,
  mergeEnrichmentResults,
  selectedEnrichmentRowIds,
} from "../../../../workflows/call-leads/sync";
import type { CallLeadPreviewResponse } from "../../../../workflows/call-leads/types";
import type { SyncCounts } from "../../../../workflows/form-leads/types";
import { sendActiveTabMessage } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderCallLeads, renderCallLeadsLogTables } from "./render";

export async function scanCallLeadsPreview(
  app: AppContext,
  options: { quiet: boolean },
): Promise<boolean> {
  const { dom } = app;
  const cl = app.state.callLeads;
  if (!options.quiet) {
    setStatus(dom, "Scanning Call Leads view…");
  }
  setBusy(app, true);

  try {
    const response = await sendActiveTabMessage<CallLeadPreviewResponse>(
      { type: "PARSE_CALL_LEAD_TABLES" },
      app.targetTabId,
    );

    cl.preview = response;
    cl.hasScanned = true;
    cl.followUpOpen = true;
    cl.bookedOpen = true;
    cl.openRowIds = new Set();

    const outcome = await previewCallLeads(response, {
      previewEnrichment: previewCallLeadEnrichment,
      previewBookedReconciliation: previewBookedCallLeadReconciliation,
    });
    cl.enrichmentRows = outcome.enrichmentRows;
    cl.bookedReconciliationRows = outcome.bookedReconciliationRows;
    if (outcome.selectedRowIds) {
      cl.selectedRowIds = new Set(outcome.selectedRowIds);
    }
    if (outcome.enrichmentError) {
      setStatus(
        dom,
        `Could not preview call lead enrichment: ${outcome.enrichmentError}`,
        { tone: "error" },
      );
    }
    if (outcome.bookedError) {
      setStatus(
        dom,
        `Could not preview booked call lead reconciliation: ${outcome.bookedError}`,
        { tone: "error" },
      );
    }

    renderCallLeads(app);
    renderCallLeadsLogTables(app);

    if (!response?.pageFound) {
      if ((response?.frameResponses ?? 0) === 0) {
        setStatus(
          dom,
          "Content script did not respond in any frame. Reload the Granot tab and the add-on.",
          { tone: "error" },
        );
      } else if (!options.quiet) {
        setStatus(
          dom,
          "No Booked Jobs or Follow Up Estimates tables found on this tab.",
          { tone: "error" },
        );
      }
      return false;
    }

    if (!options.quiet) {
      const totalRows = response.sections.reduce(
        (total, section) => total + section.rows.length,
        0,
      );
      const updateable = cl.enrichmentRows.filter(
        canSyncCallEnrichmentRow,
      ).length;
      const bookedUpdateable = cl.bookedReconciliationRows.filter(
        canSyncBookedCallReconciliationRow,
      ).length;
      setStatus(
        dom,
        `Preview ready: found ${totalRows} call lead row(s), ${updateable} updateable Follow Up row(s), ${bookedUpdateable} updateable Booked Jobs row(s).`,
      );
    }
    return true;
  } catch (err) {
    cl.preview = undefined;
    cl.enrichmentRows = [];
    cl.bookedReconciliationRows = [];
    cl.selectedRowIds = new Set();
    renderCallLeads(app);
    setStatus(
      dom,
      `Could not scan the Call Leads view: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { tone: "error" },
    );
    return false;
  } finally {
    setBusy(app, false);
  }
}

export async function syncCallRows(
  app: AppContext,
  rows: CallLeadEnrichmentRowPayload[],
): Promise<SyncCounts | undefined> {
  const { dom } = app;
  const cl = app.state.callLeads;
  if (rows.length === 0) {
    setStatus(dom, "No supported call lead rows selected for sync.", {
      tone: "error",
    });
    return undefined;
  }

  setBusy(app, true);
  setStatus(dom, `Syncing ${rows.length} call lead row(s)…`);

  try {
    const results = await syncCallLeadEnrichment(rows);
    cl.enrichmentRows = mergeEnrichmentResults(cl.enrichmentRows, results);
    cl.selectedRowIds = new Set(selectedEnrichmentRowIds(cl.enrichmentRows));
    const counts = countEnrichmentResults(results);
    setStatus(
      dom,
      `Call sync complete. Updated ${counts.updated}, unchanged ${counts.unchanged}, failed/conflict ${counts.failed}.`,
    );
    return counts;
  } catch (err) {
    setStatus(
      dom,
      `Call sync failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return undefined;
  } finally {
    setBusy(app, false);
    renderCallLeads(app);
  }
}

export async function syncBookedCallRows(
  app: AppContext,
  rows: BookedCallLeadReconciliationRowPayload[],
): Promise<SyncCounts | undefined> {
  const { dom } = app;
  const cl = app.state.callLeads;
  if (rows.length === 0) {
    setStatus(dom, "No updateable booked call lead rows found.", {
      tone: "error",
    });
    return undefined;
  }

  setBusy(app, true);
  setStatus(dom, `Updating ${rows.length} booked call lead row(s)…`);

  try {
    const results = await syncBookedCallLeadReconciliation(rows);
    cl.bookedReconciliationRows = mergeBookedReconciliationResults(
      cl.bookedReconciliationRows,
      results,
    );
    const counts = countBookedReconciliationResults(results);
    setStatus(
      dom,
      `Booked call sync complete. Updated ${counts.updated}, unchanged ${counts.unchanged}, failed/missing ${counts.failed}.`,
    );
    return counts;
  } catch (err) {
    setStatus(
      dom,
      `Booked call sync failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return undefined;
  } finally {
    setBusy(app, false);
    renderCallLeads(app);
  }
}

export async function openCallLeadsLogTables(app: AppContext): Promise<void> {
  app.state.callLeads.logTablesOpen = true;
  if (!app.state.callLeads.hasScanned) {
    setStatus(app.dom, "Scanning Call Leads tables for Log Tables view…");
    await scanCallLeadsPreview(app, { quiet: true });
  }
  renderCallLeadsLogTables(app);
}
