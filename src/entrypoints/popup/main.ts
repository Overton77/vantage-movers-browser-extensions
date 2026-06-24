// Granot Sync popup bootstrap. This file is intentionally thin: it resolves the
// popup mode (popup vs. detached movable window), builds the shared app context
// (DOM handle + mutable state), loads persisted preferences, wires events, and
// kicks off the first render. All workspace logic lives in the `app/`, `ui/`,
// and `workspaces/` modules (split out in Unit 07).
import { createInitialState } from "./app/state";
import { bootstrapAuthSession } from "../../auth/session";
import { canAccessWorkspace, defaultWorkspaceForSession } from "../../auth/gate";
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
    const detachedLabel = "✓ Movable Window Active";
    dom.openDetached.textContent = detachedLabel;
    dom.bef.openDetached.textContent = detachedLabel;
  }

  await loadPersistedState(state);
  state.auth.session = await bootstrapAuthSession();
  state.auth.loading = false;
  if (!canAccessWorkspace(state.auth.session, state.activeWorkspace)) {
    state.activeWorkspace = defaultWorkspaceForSession(state.auth.session);
  }

  hydrateInterfaceFromState(app);
  setActiveWorkspace(app, state.activeWorkspace, { persist: false });
  attachEventHandlers(app);
  renderAll(app);
  void refreshConnectionChip(app);
  if (state.auth.session?.user.role === "owner") {
    void loadCurrentLeadPreview(app, { preserveOverride: false, quiet: true });
    void loadAutomationView(app);
  }
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
