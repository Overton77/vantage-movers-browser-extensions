// Global popup render coordination. Owns the top-level render pass, the sidebar
// pulse indicators, the busy/spinner state, and the global controls. Per-
// workspace rendering lives in the workspace render modules. Extracted from
// `popup/main.ts` in Unit 07.
import type { AppContext } from "./context";
import { renderAutomation } from "../workspaces/automation/render";
import { renderCallLeads } from "../workspaces/call-leads/render";
import {
  renderFormEditLead,
  renderFormEditLeadControls,
} from "../workspaces/form-edit-lead/render";
import { renderFormLeads } from "../workspaces/form-leads/render";

export function renderAll(app: AppContext): void {
  renderFormLeads(app);
  renderCallLeads(app);
  renderFormEditLead(app);
  renderAutomation(app);
  updateGlobalControls(app);
  updateSidebarPulses(app);
}

export function updateSidebarPulses(app: AppContext): void {
  const { dom, state } = app;
  for (const tab of dom.sidebarTabs) {
    const workspace = tab.dataset.workspace;
    const shouldPulse =
      (workspace === "form-leads" && state.formLeads.autoRunning) ||
      (workspace === "call-leads" && state.callLeads.autoRunning);
    tab.classList.toggle("has-pulse", Boolean(shouldPulse));
  }
}

export function updateGlobalControls(app: AppContext): void {
  const { dom, state } = app;
  const isBusy = state.isBusy;
  dom.openDetached.disabled = isBusy || app.isDetachedWindow;
  dom.statusSpinner.classList.toggle("is-visible", isBusy);
}

export function setBusy(app: AppContext, nextIsBusy: boolean): void {
  app.state.isBusy = nextIsBusy;
  updateGlobalControls(app);
  // Re-render the whole Form Leads / Call Leads workspaces (not just their
  // top-level controls) so per-row Sync buttons pick up the new busy state.
  // Without this, the row list rendered earlier in an async scan/sync stays
  // disabled until something else re-renders it.
  renderFormLeads(app);
  renderCallLeads(app);
  renderFormEditLeadControls(app);
}
