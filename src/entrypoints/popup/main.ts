// Granot Sync popup bootstrap. This file is intentionally thin: it resolves the
// popup mode (popup vs. detached movable window), builds the shared app context
// (DOM handle + mutable state), loads persisted preferences, wires events, and
// kicks off the first render. All workspace logic lives in the `app/`, `ui/`,
// and `workspaces/` modules (split out in Unit 07).
import { createInitialState } from "./app/state";
import {
  bootstrapAuthSession,
  onAuthSessionStorageChanged,
  onDocumentVisible,
} from "../../auth/session";
import { canAccessWorkspace, defaultWorkspaceForSession } from "../../auth/gate";
import { hasExtensionRole } from "../../auth/roles";
import { AUTH_SESSION_STORAGE_KEY } from "../../auth/storage";
import type { AppContext } from "./app/context";
import { attachEventHandlers } from "./app/events";
import { loadPersistedState } from "./app/persistence";
import { renderAll } from "./app/render";
import { setActiveWorkspace } from "./app/router";
import { refreshConnectionChip } from "./app/shell";
import { getPopupDom } from "./ui/dom";
import { loadAutomationView } from "./workspaces/automation/actions";
import { loadCurrentLeadPreview } from "./workspaces/form-edit-lead/actions";
import { parseTariffAdjustment } from "./workspaces/tariff-adjustment/actions";

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
    dom.ta.openDetached.textContent = detachedLabel;
  }

  await loadPersistedState(state);
  state.auth.session = await bootstrapAuthSession();
  state.auth.loading = false;
  applySessionWorkspace(app);

  hydrateInterfaceFromState(app);
  setActiveWorkspace(app, state.activeWorkspace, { persist: false });
  attachEventHandlers(app);
  attachAuthSessionSync(app);
  renderAll(app);
  void refreshConnectionChip(app);
  if (isOwnerSignedIn(app)) {
    void loadCurrentLeadPreview(app, { preserveOverride: false, quiet: true });
    void loadAutomationView(app);
  }
  if (
    state.auth.session &&
    state.activeWorkspace === "tariff-adjustment"
  ) {
    void parseTariffAdjustment(app, { quiet: true });
  }
}

function attachAuthSessionSync(app: AppContext): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(AUTH_SESSION_STORAGE_KEY in changes)) {
      return;
    }
    onAuthSessionStorageChanged(changes, app.state.auth);
    if (!app.state.auth.session) {
      applySessionWorkspace(app);
      renderAll(app);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    void onDocumentVisible().then((session) => {
      app.state.auth.session = session;
      applySessionWorkspace(app);
      renderAll(app);
    });
  });
}

function applySessionWorkspace(app: AppContext): void {
  if (!canAccessWorkspace(app.state.auth.session, app.state.activeWorkspace)) {
    app.state.activeWorkspace = defaultWorkspaceForSession(app.state.auth.session);
  }
}

function isOwnerSignedIn(app: AppContext): boolean {
  const roles = app.state.auth.session?.user.roles;
  return Boolean(roles && hasExtensionRole(roles, "owner"));
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
