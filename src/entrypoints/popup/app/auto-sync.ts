// Popup-driven ScanAndSync loop. Runs a `window.setInterval` that re-scans and
// syncs the active workspace while the popup stays open, recording each pass in
// per-workspace cycle history. Extracted from `popup/main.ts` in Unit 07. This
// is the popup-only compatibility timer; Unit 08 adds the background alarm path
// that keeps running after the popup closes.
import {
  buildCycleSummary,
  callEnrichmentRowToCycleDetail,
  followUpRowToCycleDetail,
  intervalMs,
  type CycleDetail,
  type CycleEntry,
} from "../../../auto-sync/cycles";
import type { ListWorkspaceId } from "../../../app/state";
import { canSyncCallEnrichmentRow } from "../../../workflows/call-leads/payloads";
import { isSyncableRow } from "../../../workflows/form-leads/payloads";
import type { AppContext } from "./context";
import { formatTime } from "../ui/components";
import {
  scanCallLeadsPreview,
  syncCallRows,
} from "../workspaces/call-leads/actions";
import { renderCallLeads, renderCallLeadsHistory } from "../workspaces/call-leads/render";
import { scanFollowUpTable, syncRows } from "../workspaces/form-leads/actions";
import { renderFormLeads, renderFormLeadsHistory } from "../workspaces/form-leads/render";

const MAX_CYCLES = 40;

export function startAutoScanAndSync(
  app: AppContext,
  workflow: ListWorkspaceId,
): void {
  const ws = workflow === "form-leads" ? app.state.formLeads : app.state.callLeads;
  if (ws.autoRunning) return;

  stopAutoScanAndSync(app, workflow);

  const ms = intervalMs(ws.intervalValue, ws.intervalUnit);
  ws.autoTimerId = window.setInterval(() => {
    void runAutoScanAndSync(app, workflow);
  }, ms);
  ws.autoRunning = true;
  ws.autoStartedAt = formatTime(new Date());

  renderFormLeads(app);
  renderCallLeads(app);
  void runAutoScanAndSync(app, workflow);
}

export function stopAutoScanAndSync(
  app: AppContext,
  workflow: ListWorkspaceId,
): void {
  const ws = workflow === "form-leads" ? app.state.formLeads : app.state.callLeads;
  if (typeof ws.autoTimerId === "number") {
    window.clearInterval(ws.autoTimerId);
  }
  ws.autoTimerId = undefined;
  ws.autoRunning = false;
  ws.autoStartedAt = undefined;
  renderFormLeads(app);
  renderCallLeads(app);
}

async function runAutoScanAndSync(
  app: AppContext,
  workflow: ListWorkspaceId,
): Promise<void> {
  const startedAt = formatTime(new Date());

  if (app.state.isBusy) {
    pushCycle(app, workflow, {
      status: "failed",
      message: "Skipped cycle — another sync is already running.",
      details: [],
      startedAt,
      finishedAt: startedAt,
    });
    return;
  }

  try {
    if (workflow === "form-leads") {
      const scanned = await scanFollowUpTable(app, { quiet: true });
      if (!scanned) {
        pushCycle(app, workflow, {
          status: "failed",
          message:
            "Scan failed — no Booked Jobs or Follow Up Estimates table reachable.",
          details: [],
          startedAt,
          finishedAt: formatTime(new Date()),
        });
        return;
      }

      const syncableRows = app.state.formLeads.parsedRows.filter(isSyncableRow);
      const unsyncableRows = app.state.formLeads.parsedRows.filter(
        (row) => !isSyncableRow(row),
      );
      const results = await syncRows(app, syncableRows);

      const details: CycleDetail[] = [
        ...syncableRows.map((row) =>
          followUpRowToCycleDetail(
            row,
            app.state.formLeads.syncResults.get(row.id),
          ),
        ),
        ...unsyncableRows.map((row) => followUpRowToCycleDetail(row)),
      ];

      pushCycle(app, workflow, {
        status: results && results.failed === 0 ? "ok" : "failed",
        message: buildCycleSummary("Form Leads", syncableRows.length, results),
        details,
        startedAt,
        finishedAt: formatTime(new Date()),
      });
      return;
    }

    // call-leads
    const scanned = await scanCallLeadsPreview(app, { quiet: true });
    if (!scanned) {
      pushCycle(app, workflow, {
        status: "failed",
        message:
          "Scan failed — no Call Leads / Booked Call Leads tables reachable.",
        details: [],
        startedAt,
        finishedAt: formatTime(new Date()),
      });
      return;
    }

    const syncableRows = app.state.callLeads.enrichmentRows.filter(
      canSyncCallEnrichmentRow,
    );
    const unsyncableRows = app.state.callLeads.enrichmentRows.filter(
      (row) => !canSyncCallEnrichmentRow(row),
    );
    const results = await syncCallRows(
      app,
      syncableRows.map((row) => row.payload),
    );
    const latestEnrichmentRows = app.state.callLeads.enrichmentRows;

    const details: CycleDetail[] = [
      ...syncableRows.map((row) =>
        callEnrichmentRowToCycleDetail(
          latestEnrichmentRows.find(
            (preview) => preview.payload.row_id === row.payload.row_id,
          ) ?? row,
        ),
      ),
      ...unsyncableRows.map((row) => callEnrichmentRowToCycleDetail(row)),
    ];

    pushCycle(app, workflow, {
      status: results && results.failed === 0 ? "ok" : "failed",
      message: buildCycleSummary("Call Leads", syncableRows.length, results),
      details,
      startedAt,
      finishedAt: formatTime(new Date()),
    });
  } finally {
    renderFormLeads(app);
    renderCallLeads(app);
  }
}

function pushCycle(
  app: AppContext,
  workflow: ListWorkspaceId,
  entry: Omit<CycleEntry, "id" | "workflow">,
): void {
  const cycle: CycleEntry = {
    ...entry,
    id: `${workflow}:${Date.now()}:${Math.random()}`,
    workflow,
  };
  const ws = workflow === "form-leads" ? app.state.formLeads : app.state.callLeads;
  ws.cycles = [cycle, ...ws.cycles].slice(0, MAX_CYCLES);
  if (workflow === "form-leads") {
    renderFormLeadsHistory(app);
  } else {
    renderCallLeadsHistory(app);
  }
}
