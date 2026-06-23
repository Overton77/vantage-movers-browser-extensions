// Global popup render coordination. Owns the top-level render pass, the sidebar
// pulse indicators, the busy/spinner state, and the global controls. Per-
// workspace rendering lives in the workspace render modules. Extracted from
// `popup/main.ts` in Unit 07.
import type { AppContext } from "./context";
import { canAccessWorkspace } from "../../../auth/gate";
import { isWorkspaceId } from "./persistence";
import { renderAutomation } from "../workspaces/automation/render";
import { renderBindingEstimateFee } from "../workspaces/binding-estimate-fee/render";
import { renderCallLeads } from "../workspaces/call-leads/render";
import {
  renderFormEditLead,
  renderFormEditLeadControls,
} from "../workspaces/form-edit-lead/render";
import { renderFormLeads } from "../workspaces/form-leads/render";
import { renderCsvWorkspace } from "../workspaces/csv/render";
import { renderSearch } from "../workspaces/search/render";

export function renderAll(app: AppContext): void {
  updateAuthShell(app);
  renderFormLeads(app);
  renderCallLeads(app);
  renderFormEditLead(app);
  renderBindingEstimateFee(app);
  renderSearch(app);
  renderCsvWorkspace(app);
  renderAutomation(app);
  updateGlobalControls(app);
  updateSidebarPulses(app);
}

export function updateSidebarPulses(app: AppContext): void {
  const { dom, state } = app;
  for (const tab of dom.sidebarTabs) {
    const workspace = tab.dataset.workspace;
    if (isWorkspaceId(workspace) && !canAccessWorkspace(state.auth.session, workspace)) {
      tab.classList.remove("has-pulse");
      continue;
    }
    const shouldPulse =
      (workspace === "form-leads" && state.formLeads.autoRunning) ||
      (workspace === "call-leads" && state.callLeads.autoRunning);
    tab.classList.toggle("has-pulse", Boolean(shouldPulse));
  }
}

export function updateGlobalControls(app: AppContext): void {
  const { dom, state } = app;
  const isBusy = state.isBusy;
  dom.openDetached.disabled = isBusy || app.isDetachedWindow || !state.auth.session;
  dom.auth.submit.disabled = isBusy || state.auth.loading;
  dom.authLogout.disabled = isBusy || state.auth.loading;
  dom.statusSpinner.classList.toggle("is-visible", isBusy);
}

export function setBusy(app: AppContext, nextIsBusy: boolean): void {
  app.state.isBusy = nextIsBusy;
  updateGlobalControls(app);
  // Re-render workspaces that disable controls from `isBusy`. Without this,
  // lists rendered mid-async stay stale until something else re-renders them.
  renderFormLeads(app);
  renderCallLeads(app);
  renderFormEditLeadControls(app);
  renderBindingEstimateFee(app);
  renderCsvWorkspace(app);
}

export function updateAuthShell(app: AppContext): void {
  const { dom, state } = app;
  const session = state.auth.session;
  const authenticated = Boolean(session);

  dom.auth.panel.hidden = authenticated || state.auth.loading;
  dom.authUser.hidden = !authenticated;
  dom.authLogout.hidden = !authenticated;
  dom.authUser.textContent = session
    ? `${session.user.email} (${session.user.role})`
    : "";

  dom.auth.error.style.display = state.auth.error ? "block" : "none";
  dom.auth.error.textContent = state.auth.error ?? "";

  for (const tab of dom.sidebarTabs) {
    const workspace = tab.dataset.workspace;
    const visible =
      isWorkspaceId(workspace) &&
      canAccessWorkspace(session, workspace);
    tab.hidden = !visible;
    if (!visible) {
      tab.classList.remove("is-active", "has-pulse");
    }
  }

  for (const ws of dom.workspaces) {
    const workspace = ws.dataset.workspace;
    const visible =
      authenticated &&
      isWorkspaceId(workspace) &&
      canAccessWorkspace(session, workspace);
    ws.hidden = !visible;
    if (!visible) {
      ws.classList.remove("is-active");
    }
  }
}
