// Automation workspace actions. Loads/saves the background auto-sync settings
// and recent cycles from storage and lets the owner pin the current Granot tab
// as the automation target. Saving settings triggers the background worker to
// reschedule its alarm (via `storage.onChanged`). Added in Unit 08.
import {
  loadAutomatedSyncSettings,
  saveAutomatedSyncSettings,
  type AutomatedSyncSettings,
} from "../../../../auto-sync/settings";
import { loadBackgroundCycles } from "../../../../auto-sync/storage";
import { getTargetTabId } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setStatus } from "../../ui/status";
import { renderAutomation } from "./render";

export async function loadAutomationView(app: AppContext): Promise<void> {
  const [settings, cycles] = await Promise.all([
    loadAutomatedSyncSettings(),
    loadBackgroundCycles(),
  ]);
  app.state.automation.settings = settings;
  app.state.automation.cycles = cycles;
  app.state.automation.loaded = true;
  renderAutomation(app);
}

export async function refreshAutomationCycles(app: AppContext): Promise<void> {
  app.state.automation.cycles = await loadBackgroundCycles();
  renderAutomation(app);
}

async function applySettings(
  app: AppContext,
  mutate: (settings: AutomatedSyncSettings) => AutomatedSyncSettings,
): Promise<void> {
  const current =
    app.state.automation.settings ?? (await loadAutomatedSyncSettings());
  const next = mutate(current);
  const saved = await saveAutomatedSyncSettings(next);
  app.state.automation.settings = saved;
  renderAutomation(app);
}

export async function applyAutomationControls(app: AppContext): Promise<void> {
  const { dom } = app;
  const interval = Number(dom.auto.interval.value);
  await applySettings(app, (settings) => ({
    ...settings,
    enabled: dom.auto.enabled.checked,
    intervalMinutes:
      Number.isFinite(interval) && interval > 0
        ? interval
        : settings.intervalMinutes,
    workflows: {
      formLeads: dom.auto.wfFormLeads.checked,
      callLeadEnrichment: dom.auto.wfCallEnrichment.checked,
      bookedCallReconciliation: dom.auto.wfBooked.checked,
    },
    safety: {
      ...settings.safety,
      previewOnly: dom.auto.previewOnly.checked,
    },
  }));
  setStatus(dom, "Background auto-sync settings saved.");
}

export async function pinCurrentTabAsTarget(app: AppContext): Promise<void> {
  const { dom } = app;
  try {
    const tabId = await getTargetTabId(app.targetTabId);
    let windowId: number | undefined;
    try {
      const tab = await browser.tabs.get(tabId);
      windowId = tab.windowId;
    } catch {
      windowId = undefined;
    }
    await applySettings(app, (settings) => ({
      ...settings,
      targetTabId: tabId,
      targetWindowId: windowId,
    }));
    setStatus(dom, `Pinned tab #${tabId} as the background auto-sync target.`);
  } catch {
    setStatus(dom, "Could not resolve a Granot tab to pin.", { tone: "error" });
  }
}

export async function clearAutomationTarget(app: AppContext): Promise<void> {
  await applySettings(app, (settings) => ({
    ...settings,
    targetTabId: undefined,
    targetWindowId: undefined,
  }));
  setStatus(app.dom, "Cleared the background auto-sync target tab.");
}
