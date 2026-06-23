// Popup-driven ScanAndSync loop. Runs a `window.setInterval` that re-scans and
// syncs the active workspace while the popup stays open, recording each pass in
// per-workspace cycle history. Extracted from `popup/main.ts` in Unit 07. This
// is the popup-only compatibility timer; Unit 08 adds the background alarm path
// that keeps running after the popup closes.
import {
  buildCycleSummary,
  bookedReconciliationRowToCycleDetail,
  callEnrichmentRowToCycleDetail,
  followUpRowToCycleDetail,
  intervalMs,
  type CycleDetail,
  type CycleEntry,
} from "../../../auto-sync/cycles";
import type { ListWorkspaceId } from "../../../app/state";
import {
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../../../workflows/call-leads/payloads";
import { isRowSyncable } from "../../../workflows/form-leads/payloads";
import type { SyncCounts } from "../../../workflows/form-leads/types";
import type { AppContext } from "./context";
import { formatTime } from "../ui/components";
import {
  scanCallLeadsPreview,
  syncBookedCallRows,
  syncCallRows,
} from "../workspaces/call-leads/actions";
import { renderCallLeads, renderCallLeadsHistory } from "../workspaces/call-leads/render";
import {
  scanFollowUpTable,
  syncRows,
} from "../workspaces/form-leads/actions";
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
      const scanned = await scanFollowUpTable(app, {
        quiet: true,
        awaitPreview: true,
      });
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

      const syncableRows = app.state.formLeads.parsedRows.filter((row) =>
        isRowSyncable(row, app.state.formLeads.previews.get(row.id)),
      );
      const unsyncableRows = app.state.formLeads.parsedRows.filter(
        (row) => !isRowSyncable(row, app.state.formLeads.previews.get(row.id)),
      );
      const results =
        syncableRows.length > 0
          ? await syncRows(app, syncableRows)
          : undefined;

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
        status:
          syncableRows.length === 0 || (results && results.failed === 0)
            ? "ok"
            : "failed",
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

    const syncableEnrichmentRows = app.state.callLeads.enrichmentRows.filter(
      canSyncCallEnrichmentRow,
    );
    const unsyncableEnrichmentRows = app.state.callLeads.enrichmentRows.filter(
      (row) => !canSyncCallEnrichmentRow(row),
    );
    const syncableBookedRows = app.state.callLeads.bookedReconciliationRows.filter(
      canSyncBookedCallReconciliationRow,
    );
    const unsyncableBookedRows =
      app.state.callLeads.bookedReconciliationRows.filter(
        (row) => !canSyncBookedCallReconciliationRow(row),
      );

    const enrichmentResults =
      syncableEnrichmentRows.length > 0
        ? await syncCallRows(
            app,
            syncableEnrichmentRows.map((row) => row.payload),
          )
        : undefined;
    const bookedResults =
      syncableBookedRows.length > 0
        ? await syncBookedCallRows(
            app,
            syncableBookedRows.map((row) => row.payload),
          )
        : undefined;

    const latestEnrichmentRows = app.state.callLeads.enrichmentRows;
    const latestBookedRows = app.state.callLeads.bookedReconciliationRows;

    const combinedResults = mergeSyncCounts(enrichmentResults, bookedResults);
    const syncableTotal =
      syncableEnrichmentRows.length + syncableBookedRows.length;

    const details: CycleDetail[] = [
      ...syncableEnrichmentRows.map((row) =>
        callEnrichmentRowToCycleDetail(
          latestEnrichmentRows.find(
            (preview) => preview.payload.row_id === row.payload.row_id,
          ) ?? row,
        ),
      ),
      ...unsyncableEnrichmentRows.map((row) =>
        callEnrichmentRowToCycleDetail(row),
      ),
      ...syncableBookedRows.map((row) =>
        bookedReconciliationRowToCycleDetail(
          latestBookedRows.find(
            (preview) => preview.payload.row_id === row.payload.row_id,
          ) ?? row,
        ),
      ),
      ...unsyncableBookedRows.map((row) =>
        bookedReconciliationRowToCycleDetail(row),
      ),
    ];

    pushCycle(app, workflow, {
      status:
        syncableTotal === 0 || (combinedResults && combinedResults.failed === 0)
          ? "ok"
          : "failed",
      message: buildCycleSummary("Call Leads", syncableTotal, combinedResults),
      details,
      startedAt,
      finishedAt: formatTime(new Date()),
    });
  } finally {
    renderFormLeads(app);
    renderCallLeads(app);
  }
}

function mergeSyncCounts(
  ...counts: Array<SyncCounts | undefined>
): SyncCounts | undefined {
  const defined = counts.filter((count): count is SyncCounts => count !== undefined);
  if (defined.length === 0) {
    return undefined;
  }
  return defined.reduce(
    (total, count) => ({
      updated: total.updated + count.updated,
      unchanged: total.unchanged + count.unchanged,
      failed: total.failed + count.failed,
    }),
    { updated: 0, unchanged: 0, failed: 0 },
  );
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
