// Popup DOM references. `getPopupDom()` looks up every element the popup needs
// once at boot and returns a typed handle that render/event/action modules read
// from. Extracted from `popup/main.ts` in Unit 07 so the bootstrap stays thin
// and rendering modules receive their DOM through the shared app context.

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing DOM element: #${id}`);
  }
  return node as T;
}

export function getPopupDom() {
  return {
    appVersion: el<HTMLSpanElement>("app-version"),
    connChip: el<HTMLSpanElement>("conn-chip"),
    connChipText: el<HTMLSpanElement>("conn-chip-text"),
    openDetached: el<HTMLButtonElement>("open-detached"),
    status: el<HTMLDivElement>("status"),
    statusSpinner: el<HTMLDivElement>("status-spinner"),

    // Sidebar
    sidebarTabs: Array.from(
      document.querySelectorAll<HTMLButtonElement>(".sidebar-tab"),
    ),

    // Workspaces
    workspaces: Array.from(document.querySelectorAll<HTMLElement>(".workspace")),

    // Form Leads
    fl: {
      scan: el<HTMLButtonElement>("form-leads-scan"),
      log: el<HTMLButtonElement>("form-leads-log"),
      syncSelected: el<HTMLButtonElement>("form-leads-sync-selected"),
      syncAll: el<HTMLButtonElement>("form-leads-sync-all"),
      selectAll: el<HTMLButtonElement>("form-leads-select-all"),
      deselectAll: el<HTMLButtonElement>("form-leads-deselect-all"),
      expandAll: el<HTMLButtonElement>("form-leads-expand-all"),
      collapseAll: el<HTMLButtonElement>("form-leads-collapse-all"),
      intervalValue: el<HTMLInputElement>("form-leads-interval-value"),
      intervalUnit: el<HTMLSelectElement>("form-leads-interval-unit"),
      filter: el<HTMLSelectElement>("form-leads-filter"),
      autoStart: el<HTMLButtonElement>("form-leads-auto-start"),
      autoStop: el<HTMLButtonElement>("form-leads-auto-stop"),
      autoMeta: el<HTMLSpanElement>("form-leads-auto-meta"),
      autoBadge: el<HTMLSpanElement>("form-leads-auto-badge"),
      autoBadgeText: el<HTMLSpanElement>("form-leads-auto-badge-text"),
      pausedBanner: el<HTMLDivElement>("form-leads-paused-banner"),
      summary: el<HTMLDivElement>("form-leads-summary"),
      rowsContainer: el<HTMLDivElement>("form-leads-rows-container"),
      rowlistCard: el<HTMLDivElement>("form-leads-rowlist-card"),
      rows: el<HTMLDivElement>("form-leads-rows"),
      empty: el<HTMLDivElement>("form-leads-empty"),
      logContainer: el<HTMLDivElement>("form-leads-log-tables-container"),
      history: el<HTMLDivElement>("form-leads-history"),
      historyMeta: el<HTMLSpanElement>("form-leads-history-meta"),
    },

    // Call Leads
    cl: {
      scan: el<HTMLButtonElement>("call-leads-scan"),
      log: el<HTMLButtonElement>("call-leads-log"),
      syncBooked: el<HTMLButtonElement>("call-leads-sync-booked"),
      syncSelected: el<HTMLButtonElement>("call-leads-sync-selected"),
      syncAll: el<HTMLButtonElement>("call-leads-sync-all"),
      selectAll: el<HTMLButtonElement>("call-leads-select-all"),
      deselectAll: el<HTMLButtonElement>("call-leads-deselect-all"),
      expandAll: el<HTMLButtonElement>("call-leads-expand-all"),
      collapseAll: el<HTMLButtonElement>("call-leads-collapse-all"),
      intervalValue: el<HTMLInputElement>("call-leads-interval-value"),
      intervalUnit: el<HTMLSelectElement>("call-leads-interval-unit"),
      filter: el<HTMLSelectElement>("call-leads-filter"),
      autoStart: el<HTMLButtonElement>("call-leads-auto-start"),
      autoStop: el<HTMLButtonElement>("call-leads-auto-stop"),
      autoMeta: el<HTMLSpanElement>("call-leads-auto-meta"),
      autoBadge: el<HTMLSpanElement>("call-leads-auto-badge"),
      autoBadgeText: el<HTMLSpanElement>("call-leads-auto-badge-text"),
      pausedBanner: el<HTMLDivElement>("call-leads-paused-banner"),
      summary: el<HTMLDivElement>("call-leads-summary"),
      rowsContainer: el<HTMLDivElement>("call-leads-rows-container"),
      rowlistCard: el<HTMLDivElement>("call-leads-rowlist-card"),
      rows: el<HTMLDivElement>("call-leads-rows"),
      empty: el<HTMLDivElement>("call-leads-empty"),
      bookedContainer: el<HTMLDivElement>("call-leads-booked-container"),
      logContainer: el<HTMLDivElement>("call-leads-log-tables-container"),
      history: el<HTMLDivElement>("call-leads-history"),
      historyMeta: el<HTMLSpanElement>("call-leads-history-meta"),
    },

    // Form Edit Lead
    fe: {
      scan: el<HTMLButtonElement>("current-lead-scan"),
      sync: el<HTMLButtonElement>("current-lead-sync"),
      content: el<HTMLDivElement>("current-lead-content"),
    },

    // Automation (background auto-sync)
    auto: {
      badge: el<HTMLSpanElement>("auto-bg-badge"),
      badgeText: el<HTMLSpanElement>("auto-bg-badge-text"),
      status: el<HTMLSpanElement>("auto-bg-status"),
      enabled: el<HTMLInputElement>("auto-bg-enabled"),
      interval: el<HTMLInputElement>("auto-bg-interval"),
      previewOnly: el<HTMLInputElement>("auto-bg-preview-only"),
      pinTab: el<HTMLButtonElement>("auto-bg-pin-tab"),
      clearTab: el<HTMLButtonElement>("auto-bg-clear-tab"),
      refresh: el<HTMLButtonElement>("auto-bg-refresh"),
      target: el<HTMLDivElement>("auto-bg-target"),
      wfFormLeads: el<HTMLInputElement>("auto-bg-wf-form-leads"),
      wfCallEnrichment: el<HTMLInputElement>("auto-bg-wf-call-enrichment"),
      wfBooked: el<HTMLInputElement>("auto-bg-wf-booked"),
      history: el<HTMLDivElement>("auto-bg-history"),
      historyMeta: el<HTMLSpanElement>("auto-bg-history-meta"),
    },

    // Diagnose
    diagnoseRun: el<HTMLButtonElement>("diagnose-run"),
    diagnoseOutput: el<HTMLDivElement>("diagnose-output"),

    // Debug
    debugDump: el<HTMLButtonElement>("debug-dump"),
    debugResult: el<HTMLParagraphElement>("debug-result"),

    // Main scroll container + Back-to-top
    main: document.querySelector<HTMLElement>(".app__main"),
    backToTop: el<HTMLButtonElement>("back-to-top"),
  };
}

export type PopupDom = ReturnType<typeof getPopupDom>;
