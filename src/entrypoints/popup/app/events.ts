// Centralized popup event wiring. Binds every sidebar, top-bar, and workspace
// control to the workspace actions/renders. Bound once at boot so handlers are
// never duplicated across re-renders. Extracted from `popup/main.ts` in Unit 07.
import { isSyncableRow } from "../../../workflows/form-leads/payloads";
import {
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../../../workflows/call-leads/payloads";
import {
  AUTOMATED_SYNC_SETTINGS_KEY,
} from "../../../auto-sync/settings";
import { AUTOMATED_SYNC_CYCLES_KEY } from "../../../auto-sync/storage";
import { startAutoScanAndSync, stopAutoScanAndSync } from "./auto-sync";
import type { AppContext } from "./context";
import {
  applyAutomationControls,
  clearAutomationTarget,
  loadAutomationView,
  pinCurrentTabAsTarget,
  refreshAutomationCycles,
} from "../workspaces/automation/actions";
import {
  isIntervalUnit,
  isProgressFilter,
  isWorkspaceId,
  savePersistedState,
} from "./persistence";
import { setActiveWorkspace } from "./router";
import { openDetached } from "./shell";
import {
  openCallLeadsLogTables,
  scanCallLeadsPreview,
  syncBookedCallRows,
  syncCallRows,
} from "../workspaces/call-leads/actions";
import { renderCallLeads } from "../workspaces/call-leads/render";
import {
  loadCurrentLeadPreview,
  syncCurrentLead,
} from "../workspaces/form-edit-lead/actions";
import {
  openFormLeadsLogTables,
  scanFollowUpTable,
  syncRows,
} from "../workspaces/form-leads/actions";
import { renderFormLeads } from "../workspaces/form-leads/render";
import { runAndRenderDiagnostics } from "../workspaces/diagnostics/render";
import { runDebugDumpTables } from "../workspaces/debug/render";

export function attachEventHandlers(app: AppContext): void {
  const { dom, state } = app;

  // Sidebar
  for (const tab of dom.sidebarTabs) {
    tab.addEventListener("click", () => {
      const workspace = tab.dataset.workspace;
      if (isWorkspaceId(workspace)) {
        setActiveWorkspace(app, workspace);
      }
    });
  }

  // Top bar
  dom.openDetached.addEventListener("click", () => void openDetached(app));

  // Form Leads
  dom.fl.scan.addEventListener("click", () => {
    void scanFollowUpTable(app, { quiet: false });
  });
  dom.fl.log.addEventListener("click", () => {
    void openFormLeadsLogTables(app);
  });
  dom.fl.syncSelected.addEventListener("click", () => {
    void syncRows(
      app,
      state.formLeads.parsedRows.filter((row) =>
        state.formLeads.selectedRowIds.has(row.id),
      ),
    );
  });
  dom.fl.syncAll.addEventListener("click", () => {
    void syncRows(app, state.formLeads.parsedRows.filter(isSyncableRow));
  });
  dom.fl.selectAll.addEventListener("click", () => {
    state.formLeads.selectedRowIds = new Set(
      state.formLeads.parsedRows.filter(isSyncableRow).map((row) => row.id),
    );
    renderFormLeads(app);
  });
  dom.fl.deselectAll.addEventListener("click", () => {
    state.formLeads.selectedRowIds = new Set();
    renderFormLeads(app);
  });
  dom.fl.expandAll.addEventListener("click", () => {
    state.formLeads.openRowIds = new Set(
      state.formLeads.parsedRows.map((row) => row.id),
    );
    renderFormLeads(app);
  });
  dom.fl.collapseAll.addEventListener("click", () => {
    state.formLeads.openRowIds = new Set();
    renderFormLeads(app);
  });
  dom.fl.intervalValue.addEventListener("change", () => {
    const value = Number(dom.fl.intervalValue.value);
    if (Number.isFinite(value) && value > 0) {
      state.formLeads.intervalValue = value;
      void savePersistedState(state);
    }
  });
  dom.fl.intervalUnit.addEventListener("change", () => {
    if (isIntervalUnit(dom.fl.intervalUnit.value)) {
      state.formLeads.intervalUnit = dom.fl.intervalUnit.value;
      void savePersistedState(state);
    }
  });
  dom.fl.filter.addEventListener("change", () => {
    if (isProgressFilter(dom.fl.filter.value)) {
      state.formLeads.progressFilter = dom.fl.filter.value;
      void savePersistedState(state);
      renderFormLeads(app);
    }
  });
  dom.fl.autoStart.addEventListener("click", () =>
    startAutoScanAndSync(app, "form-leads"),
  );
  dom.fl.autoStop.addEventListener("click", () =>
    stopAutoScanAndSync(app, "form-leads"),
  );

  // Call Leads
  dom.cl.scan.addEventListener("click", () => {
    void scanCallLeadsPreview(app, { quiet: false });
  });
  dom.cl.log.addEventListener("click", () => {
    void openCallLeadsLogTables(app);
  });
  dom.cl.syncBooked.addEventListener("click", () => {
    void syncBookedCallRows(
      app,
      state.callLeads.bookedReconciliationRows
        .filter(canSyncBookedCallReconciliationRow)
        .map((row) => row.payload),
    );
  });
  dom.cl.syncSelected.addEventListener("click", () => {
    void syncCallRows(
      app,
      state.callLeads.enrichmentRows
        .filter((row) => state.callLeads.selectedRowIds.has(row.payload.row_id))
        .map((row) => row.payload),
    );
  });
  dom.cl.syncAll.addEventListener("click", () => {
    void syncCallRows(
      app,
      state.callLeads.enrichmentRows
        .filter(canSyncCallEnrichmentRow)
        .map((row) => row.payload),
    );
  });
  dom.cl.selectAll.addEventListener("click", () => {
    state.callLeads.selectedRowIds = new Set(
      state.callLeads.enrichmentRows
        .filter(canSyncCallEnrichmentRow)
        .map((row) => row.payload.row_id),
    );
    renderCallLeads(app);
  });
  dom.cl.deselectAll.addEventListener("click", () => {
    state.callLeads.selectedRowIds = new Set();
    renderCallLeads(app);
  });
  dom.cl.expandAll.addEventListener("click", () => {
    const ids = new Set<string>();
    const sections = state.callLeads.preview?.sections ?? [];
    for (const section of sections) {
      for (const row of section.rows) {
        ids.add(row.id);
      }
    }
    state.callLeads.openRowIds = ids;
    renderCallLeads(app);
  });
  dom.cl.collapseAll.addEventListener("click", () => {
    state.callLeads.openRowIds = new Set();
    renderCallLeads(app);
  });
  dom.cl.intervalValue.addEventListener("change", () => {
    const value = Number(dom.cl.intervalValue.value);
    if (Number.isFinite(value) && value > 0) {
      state.callLeads.intervalValue = value;
      void savePersistedState(state);
    }
  });
  dom.cl.intervalUnit.addEventListener("change", () => {
    if (isIntervalUnit(dom.cl.intervalUnit.value)) {
      state.callLeads.intervalUnit = dom.cl.intervalUnit.value;
      void savePersistedState(state);
    }
  });
  dom.cl.filter.addEventListener("change", () => {
    if (isProgressFilter(dom.cl.filter.value)) {
      state.callLeads.progressFilter = dom.cl.filter.value;
      void savePersistedState(state);
      renderCallLeads(app);
    }
  });
  dom.cl.autoStart.addEventListener("click", () =>
    startAutoScanAndSync(app, "call-leads"),
  );
  dom.cl.autoStop.addEventListener("click", () =>
    stopAutoScanAndSync(app, "call-leads"),
  );

  // Form Edit Lead
  dom.fe.scan.addEventListener("click", () => {
    void loadCurrentLeadPreview(app, { preserveOverride: false });
  });
  dom.fe.sync.addEventListener("click", () => {
    void syncCurrentLead(app);
  });

  // Automation (background auto-sync)
  for (const control of [
    dom.auto.enabled,
    dom.auto.interval,
    dom.auto.previewOnly,
    dom.auto.wfFormLeads,
    dom.auto.wfCallEnrichment,
    dom.auto.wfBooked,
  ]) {
    control.addEventListener("change", () => {
      void applyAutomationControls(app);
    });
  }
  dom.auto.pinTab.addEventListener("click", () => {
    void pinCurrentTabAsTarget(app);
  });
  dom.auto.clearTab.addEventListener("click", () => {
    void clearAutomationTarget(app);
  });
  dom.auto.refresh.addEventListener("click", () => {
    void loadAutomationView(app);
  });

  // Keep the popup's automation view live when the background worker writes a
  // new cycle, or settings change in another popup instance.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (AUTOMATED_SYNC_CYCLES_KEY in changes) {
      void refreshAutomationCycles(app);
    }
    if (AUTOMATED_SYNC_SETTINGS_KEY in changes) {
      void loadAutomationView(app);
    }
  });

  // Diagnose
  dom.diagnoseRun.addEventListener("click", () => {
    void runAndRenderDiagnostics(app);
  });

  // Debug
  dom.debugDump.addEventListener("click", () => {
    void runDebugDumpTables(app);
  });

  attachBackToTop(app);
}

/**
 * Wires up the floating "Back to top" button. The button fades in once the
 * user has scrolled past a threshold inside the main workspace area, and
 * smooth-scrolls back to the top on click. We also reset scroll to top when
 * the workspace changes so a tall Form Leads view doesn't leave the user
 * stranded mid-page when they switch to Call Leads.
 */
function attachBackToTop(app: AppContext): void {
  const { dom } = app;
  const main = dom.main;
  if (!main) return;

  const threshold = 240;
  const updateVisibility = () => {
    if (main.scrollTop > threshold) {
      dom.backToTop.classList.add("is-visible");
    } else {
      dom.backToTop.classList.remove("is-visible");
    }
  };
  main.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();

  dom.backToTop.addEventListener("click", () => {
    main.scrollTo({ top: 0, behavior: "smooth" });
  });
}
