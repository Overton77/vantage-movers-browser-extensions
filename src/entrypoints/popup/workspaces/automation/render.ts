// Automation workspace rendering. Mirrors the background auto-sync settings and
// recent background cycles (read from storage) into the popup controls. The
// popup is only the control/display surface; the cycles themselves are produced
// by the background service worker. Added in Unit 08.
import type { BackgroundCycle } from "../../../../auto-sync/storage";
import type { AppContext } from "../../app/context";
import { cycleDetailIcon } from "../../ui/components";

export function renderAutomation(app: AppContext): void {
  renderAutomationControls(app);
  renderAutomationHistory(app);
}

function renderAutomationControls(app: AppContext): void {
  const { dom } = app;
  const auto = app.state.automation;
  const settings = auto.settings;

  const controls = [
    dom.auto.enabled,
    dom.auto.interval,
    dom.auto.previewOnly,
    dom.auto.pinTab,
    dom.auto.clearTab,
    dom.auto.wfFormLeads,
    dom.auto.wfCallEnrichment,
    dom.auto.wfBooked,
  ];

  if (!settings) {
    for (const control of controls) control.disabled = true;
    dom.auto.status.textContent = auto.loaded ? "unavailable" : "loading…";
    return;
  }

  for (const control of controls) control.disabled = false;

  dom.auto.enabled.checked = settings.enabled;
  dom.auto.interval.value = String(settings.intervalMinutes);
  dom.auto.previewOnly.checked = settings.safety.previewOnly;
  dom.auto.wfFormLeads.checked = settings.workflows.formLeads;
  dom.auto.wfCallEnrichment.checked = settings.workflows.callLeadEnrichment;
  dom.auto.wfBooked.checked = settings.workflows.bookedCallReconciliation;

  dom.auto.status.textContent = settings.enabled
    ? `enabled · every ${settings.intervalMinutes} min · ${
        settings.safety.previewOnly ? "preview-only" : "writing"
      }`
    : "disabled";

  dom.auto.badge.classList.toggle("is-hidden", !settings.enabled);
  dom.auto.badgeText.textContent = settings.safety.previewOnly
    ? "Background preview"
    : "Background syncing";

  if (typeof settings.targetTabId === "number") {
    dom.auto.target.textContent = `Target tab #${settings.targetTabId}${
      typeof settings.targetWindowId === "number"
        ? ` (window ${settings.targetWindowId})`
        : ""
    }`;
  } else {
    dom.auto.target.textContent =
      "No target tab pinned. Open this popup from the Granot tab and click Pin Current Tab As Target.";
  }
}

function renderAutomationHistory(app: AppContext): void {
  const { dom } = app;
  const cycles = app.state.automation.cycles;
  dom.auto.history.textContent = "";
  dom.auto.historyMeta.textContent = `${cycles.length} cycle(s)`;
  if (cycles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.style.margin = "0";
    empty.textContent = "No background cycles recorded yet.";
    dom.auto.history.append(empty);
    return;
  }
  cycles.forEach((cycle, index) => {
    dom.auto.history.append(buildBackgroundCycleElement(cycle, index === 0));
  });
}

function buildBackgroundCycleElement(
  cycle: BackgroundCycle,
  expanded: boolean,
): HTMLElement {
  const details = document.createElement("details");
  details.className = `cycle ${cycle.status === "failed" ? "is-error" : "is-ok"}`;
  details.open = expanded;

  const summary = document.createElement("summary");

  const time = document.createElement("span");
  time.className = "cycle__time";
  time.textContent = formatCycleTime(cycle.startedAt);
  summary.append(time);

  const icon = document.createElement("span");
  icon.textContent =
    cycle.status === "ok" ? "✓" : cycle.status === "skipped" ? "—" : "✗";
  icon.style.color =
    cycle.status === "ok"
      ? "#16a34a"
      : cycle.status === "skipped"
        ? "#ca8a04"
        : "#dc2626";
  icon.style.fontWeight = "700";
  summary.append(icon);

  const label = document.createElement("span");
  label.className = "row-compact__chip";
  label.textContent = cycle.workflow;
  summary.append(label);

  const summaryText = document.createElement("span");
  summaryText.className = "cycle__summary";
  summaryText.textContent = cycle.message;
  summary.append(summaryText);

  details.append(summary);

  const body = document.createElement("div");
  body.className = "cycle__body";

  if (cycle.details.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.style.margin = "0";
    empty.textContent = "No row-level details captured for this cycle.";
    body.append(empty);
  } else {
    for (const detail of cycle.details) {
      const detailEl = document.createElement("div");
      detailEl.className = `cycle__row is-${detail.status}`;
      const iconEl = document.createElement("span");
      iconEl.className = "cycle__row-icon";
      iconEl.textContent = cycleDetailIcon(detail.status);
      const textEl = document.createElement("span");
      textEl.textContent = `${detail.rowLabel} — ${detail.message}`;
      detailEl.append(iconEl, textEl);
      body.append(detailEl);
    }
  }

  details.append(body);
  return details;
}

function formatCycleTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
