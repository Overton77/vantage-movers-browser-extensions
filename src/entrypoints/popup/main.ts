// Granot Sync popup bootstrap. This file is intentionally thin: it resolves the
// popup mode (popup vs. detached movable window), builds the shared app context
// (DOM handle + mutable state), loads persisted preferences, wires events, and
// kicks off the first render. All workspace logic lives in the `app/`, `ui/`,
// and `workspaces/` modules (split out in Unit 07).
import { createInitialState } from "./app/state";
import type { AppContext } from "./app/context";
import { attachEventHandlers } from "./app/events";
import { loadPersistedState } from "./app/persistence";
import { renderAll } from "./app/render";
import { setActiveWorkspace } from "./app/router";
import { refreshConnectionChip } from "./app/shell";
import { getPopupDom } from "./ui/dom";
import { loadAutomationView } from "./workspaces/automation/actions";
import { loadCurrentLeadPreview } from "./workspaces/form-edit-lead/actions";

function resolvePopupMode(): {
  targetTabId?: number;
  isDetachedWindow: boolean;
} {
  const popupParams = new URLSearchParams(window.location.search);
  const targetTabIdRaw = popupParams.get("targetTabId");
  const targetTabIdParsed =
    targetTabIdRaw != null && targetTabIdRaw !== ""
      ? Number(targetTabIdRaw)
      : NaN;
  const targetTabId =
    Number.isInteger(targetTabIdParsed) && targetTabIdParsed > 0
      ? targetTabIdParsed
      : undefined;
  return {
    targetTabId,
    isDetachedWindow: popupParams.get("detached") === "1",
  };
}

void init();

async function init(): Promise<void> {
  const dom = getPopupDom();
  const state = createInitialState();
  const { targetTabId, isDetachedWindow } = resolvePopupMode();
  const app: AppContext = { dom, state, isDetachedWindow, targetTabId };

  const manifest = browser.runtime.getManifest();
  dom.appVersion.textContent = `v${manifest.version}`;
  if (isDetachedWindow) {
    dom.openDetached.textContent = "✓ Movable Window Active";
  }

  await loadPersistedState(state);

  hydrateInterfaceFromState(app);
  setActiveWorkspace(app, state.activeWorkspace, { persist: false });
  attachEventHandlers(app);
  renderAll(app);
  void refreshConnectionChip(app);
  void loadCurrentLeadPreview(app, { preserveOverride: false, quiet: true });
  void loadAutomationView(app);
}

function hydrateInterfaceFromState(app: AppContext): void {
  const { dom, state } = app;
  dom.fl.intervalValue.value = String(state.formLeads.intervalValue);
  dom.fl.intervalUnit.value = state.formLeads.intervalUnit;
  dom.fl.filter.value = state.formLeads.progressFilter;
  dom.cl.intervalValue.value = String(state.callLeads.intervalValue);
  dom.cl.intervalUnit.value = state.callLeads.intervalUnit;
  dom.cl.filter.value = state.callLeads.progressFilter;
}
