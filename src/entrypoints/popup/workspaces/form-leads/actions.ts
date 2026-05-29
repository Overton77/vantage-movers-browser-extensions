// Form Leads workspace actions. Thin popup orchestration around the extracted
// Form Leads workflow: scan the Granot table, preview each row against Vantage,
// and sync supported rows. Each action owns popup status/busy/state/render side
// effects; the actual scan/preview/sync logic lives in `workflows/form-leads`.
// Extracted from `popup/main.ts` in Unit 07.
import {
  getFormLeadById,
  updateFormLead,
} from "../../../../utils/api";
import {
  isSyncableRow,
  rowToSyncCandidate,
} from "../../../../workflows/form-leads/payloads";
import { previewFormLeadRows as runFormLeadPreview } from "../../../../workflows/form-leads/preview";
import { scanFollowUpRows } from "../../../../workflows/form-leads/scan";
import { syncLeadCandidates as runSyncLeadCandidates } from "../../../../workflows/form-leads/sync";
import type {
  FollowUpRow,
  ParseResponse,
  SyncCounts,
} from "../../../../workflows/form-leads/types";
import { sendActiveTabMessage } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderFormLeads, renderFormLeadsLogTables } from "./render";

export async function scanFollowUpTable(
  app: AppContext,
  options: { quiet: boolean },
): Promise<boolean> {
  const { dom } = app;
  if (!options.quiet) {
    setStatus(dom, "Scanning Booked Jobs / Follow Up Estimates…");
  }
  setBusy(app, true);

  try {
    const { response, syncableRowIds } = await scanFollowUpRows({
      sendParseMessage: () =>
        sendActiveTabMessage<ParseResponse>(
          { type: "PARSE_FOLLOW_UP_ROWS" },
          app.targetTabId,
        ),
    });

    if (!response?.tableFound) {
      app.state.formLeads.parsedRows = [];
      app.state.formLeads.selectedRowIds = new Set();
      app.state.formLeads.hasScanned = true;
      renderFormLeads(app);
      renderFormLeadsLogTables(app);

      if ((response?.frameResponses ?? 0) === 0) {
        setStatus(
          dom,
          "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.",
          { tone: "error" },
        );
      } else if (!options.quiet) {
        setStatus(
          dom,
          "No Booked Jobs or Follow Up Estimates table found on this tab.",
          { tone: "error" },
        );
      }
      return false;
    }

    app.state.formLeads.parsedRows = response.rows;
    app.state.formLeads.selectedRowIds = new Set(syncableRowIds);
    app.state.formLeads.syncResults = new Map();
    app.state.formLeads.previews = new Map();
    app.state.formLeads.openRowIds = new Set();
    app.state.formLeads.hasScanned = true;
    app.state.formLeads.followUpOpen = true;
    renderFormLeads(app);
    renderFormLeadsLogTables(app);

    void previewFormLeadRows(app, response.rows).then(() => {
      renderFormLeads(app);
      renderFormLeadsLogTables(app);
    });

    if (!options.quiet) {
      setStatus(
        dom,
        `Found ${response.counts.total} row(s), ${response.counts.syncable} syncable. Previewing Vantage state…`,
      );
    }
    return true;
  } catch (err) {
    setStatus(
      dom,
      `Could not scan: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return false;
  } finally {
    setBusy(app, false);
  }
}

/**
 * Looks up every syncable row in Vantage (`GET /api/v1/form-leads/:id`) and
 * stores a preview describing what running Sync would do:
 *   - has_booking : form lead has an attached BookedLead (idempotent sync)
 *   - idempotent  : no booking, quoted/cubic_feet already match
 *   - will_update : no booking, at least one of quoted/cubic_feet will change
 *   - not_found   : form lead was deleted or ref_no is wrong (still an error)
 *
 * Runs in parallel; failures are stored as `preview_error` so the user can see
 * what went wrong without blocking the rest of the workflow.
 */
export async function previewFormLeadRows(
  app: AppContext,
  rows: FollowUpRow[],
): Promise<void> {
  const previews = await runFormLeadPreview(rows, { getFormLeadById });
  for (const [id, preview] of previews) {
    app.state.formLeads.previews.set(id, preview);
  }
}

export async function syncRows(
  app: AppContext,
  rows: FollowUpRow[],
): Promise<SyncCounts | undefined> {
  const { dom } = app;
  const syncableRows = rows.filter(isSyncableRow).map(rowToSyncCandidate);
  if (syncableRows.length === 0) {
    setStatus(dom, "No supported rows selected for sync.", { tone: "error" });
    return undefined;
  }

  setBusy(app, true);
  setStatus(dom, `Syncing ${syncableRows.length} row(s)…`);

  const results = await runSyncLeadCandidates(
    syncableRows,
    { getFormLeadById, updateFormLead },
    (id, result) => {
      app.state.formLeads.syncResults.set(id, result);
      renderFormLeads(app);
    },
  );

  setStatus(
    dom,
    `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`,
  );
  setBusy(app, false);
  renderFormLeads(app);
  return results;
}

export async function openFormLeadsLogTables(app: AppContext): Promise<void> {
  app.state.formLeads.logTablesOpen = true;
  if (!app.state.formLeads.hasScanned) {
    setStatus(
      app.dom,
      "Scanning Booked Jobs / Follow Up tables for Log Tables view…",
    );
    await scanFollowUpTable(app, { quiet: true });
  }
  renderFormLeadsLogTables(app);
}
