// Granot Sync popup — workspace router + per-workspace state + reusable UI primitives.
// (rev: sidebar workspaces, per-row Sync, IntervalPicker, accordion cycle history, log tables)
import { GRANOT_URL_PATTERNS } from "../../config";
import {
  getFormLeadById,
  previewBookedCallLeadReconciliation,
  previewCallLeadEnrichment,
  syncBookedCallLeadReconciliation,
  syncCallLeadEnrichment,
  updateFormLead,
  type BookedCallLeadReconciliationResult,
  type BookedCallLeadReconciliationRowPayload,
  type CallLeadEnrichmentResult,
  type CallLeadEnrichmentRowPayload,
  type FormLeadUpdatePayload,
} from "../../utils/api";

/* ============================================================================
 * Types
 * ========================================================================== */

type WorkspaceId =
  | "form-leads"
  | "form-edit-lead"
  | "call-leads"
  | "diagnose"
  | "debug";

type IntervalUnit = "seconds" | "minutes" | "hours";

type ProgressFilter = "all" | "syncable" | "failed";

type OverrideMode = "parsed" | "quoted_false" | "quoted_true";

type LeadStatus =
  | "syncable"
  | "invalid_ref_no"
  | "unsupported_prior"
  | "missing_prior";

type FollowUpRow = {
  id: string;
  rowIndex: number;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  estCf?: string;
  cubicFeet?: number;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  status: LeadStatus;
  reason?: string;
};

type CurrentFormLead = {
  id: string;
  refNo: string;
  prior: string;
  priorityLevel: number | undefined;
  quoted?: boolean;
  status: LeadStatus;
  reason?: string;
  pageUrl: string;
};

type ParseResponse = {
  ok: true;
  tableFound: boolean;
  rows: FollowUpRow[];
  counts: {
    total: number;
    syncable: number;
    invalid: number;
    unsupported: number;
  };
  frameResponses?: number;
  frameCount?: number;
};

type CurrentFormLeadParseResponse = {
  ok: true;
  pageFound: boolean;
  lead?: CurrentFormLead;
  frameResponses?: number;
  frameCount?: number;
};

type CallLeadPreviewRow = {
  id: string;
  rowIndex: number;
  values: Record<string, string>;
};

type CallLeadPreviewSection = {
  key: "bookedJobs" | "followUpEstimates";
  title: string;
  tableFound: boolean;
  headers: string[];
  rows: CallLeadPreviewRow[];
};

type CallLeadPreviewResponse = {
  ok: true;
  pageFound: boolean;
  sections: CallLeadPreviewSection[];
  frameResponses?: number;
  frameCount?: number;
};

type CallLeadEnrichmentPreview = {
  payload: CallLeadEnrichmentRowPayload;
  result?: CallLeadEnrichmentResult;
};

type BookedCallLeadReconciliationPreview = {
  payload: BookedCallLeadReconciliationRowPayload;
  result?: BookedCallLeadReconciliationResult;
};

type LeadSyncCandidate = {
  id: string;
  refNo: string;
  quoted?: boolean;
  cubicFeet?: number;
  status: LeadStatus;
};

type CurrentLeadPreview = {
  lead: CurrentFormLead;
  currentQuoted?: boolean;
  currentCubicFeet?: number;
  error?: string;
};

type RowSyncResult = {
  status: "updated" | "unchanged" | "failed" | "skipped";
  message: string;
};

type SyncCounts = {
  updated: number;
  unchanged: number;
  failed: number;
};

type CycleDetail = {
  rowId: string;
  rowLabel: string;
  status: "ok" | "unchanged" | "failed" | "skipped";
  message: string;
};

type CycleEntry = {
  id: string;
  workflow: ListWorkspaceId;
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  message: string;
  details: CycleDetail[];
};

type ListWorkspaceId = "form-leads" | "call-leads";

type FormLeadsState = {
  parsedRows: FollowUpRow[];
  selectedRowIds: Set<string>;
  syncResults: Map<string, RowSyncResult>;
  cycles: CycleEntry[];
  progressFilter: ProgressFilter;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  hasScanned: boolean;
  logTablesOpen: boolean;
  followUpOpen: boolean;
};

type CallLeadsState = {
  preview?: CallLeadPreviewResponse;
  enrichmentRows: CallLeadEnrichmentPreview[];
  bookedReconciliationRows: BookedCallLeadReconciliationPreview[];
  selectedRowIds: Set<string>;
  cycles: CycleEntry[];
  progressFilter: ProgressFilter;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  hasScanned: boolean;
  logTablesOpen: boolean;
  followUpOpen: boolean;
  bookedOpen: boolean;
};

type FormEditLeadState = {
  preview?: CurrentLeadPreview;
  override: OverrideMode;
  result?: RowSyncResult;
};

type AppState = {
  activeWorkspace: WorkspaceId;
  isBusy: boolean;
  formLeads: FormLeadsState;
  callLeads: CallLeadsState;
  formEditLead: FormEditLeadState;
};

type PersistedState = {
  activeWorkspace?: WorkspaceId;
  formLeads?: {
    intervalValue?: number;
    intervalUnit?: IntervalUnit;
    progressFilter?: ProgressFilter;
  };
  callLeads?: {
    intervalValue?: number;
    intervalUnit?: IntervalUnit;
    progressFilter?: ProgressFilter;
  };
};

type FramePingResponse = {
  ok?: boolean;
  type?: string;
  extensionVersion?: string;
  extensionName?: string;
  runtimeId?: string;
  frameUrl?: string;
  isTopFrame?: boolean;
  documentReadyState?: string;
  documentTitle?: string;
  htmlLength?: number;
  tableCount?: number;
  hasFollowUpHeading?: boolean;
  hasBookedJobsHeading?: boolean;
  startedAt?: string;
  respondedAt?: string;
};

type FrameDiagnostic = {
  frameId: number;
  parentFrameId?: number;
  frameUrl?: string;
  pingResponse?: FramePingResponse;
  pingError?: string;
};

type DiagnosticsReport = {
  popupUrl: string;
  popupWindowId?: number;
  isDetached: boolean;
  targetTabId?: number;
  activeTabId?: number;
  activeTabUrl?: string;
  activeTabTitle?: string;
  activeWindowId?: number;
  matchPatterns: string[];
  matches: boolean;
  matchingPattern?: string;
  manifestVersion: string;
  manifestName: string;
  manifestRuntimeId: string;
  browser: "firefox" | "chrome" | "unknown";
  manifestVersionNumber: number;
  frames: FrameDiagnostic[];
  errors: string[];
};

/* ============================================================================
 * DOM lookup
 * ========================================================================== */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing DOM element: #${id}`);
  }
  return node as T;
}

const dom = {
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

  // Diagnose
  diagnoseRun: el<HTMLButtonElement>("diagnose-run"),
  diagnoseOutput: el<HTMLDivElement>("diagnose-output"),

  // Debug
  debugDump: el<HTMLButtonElement>("debug-dump"),
  debugResult: el<HTMLParagraphElement>("debug-result"),
};

/* ============================================================================
 * Popup mode (popup vs detached movable window)
 * ========================================================================== */

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
const isDetachedWindow = popupParams.get("detached") === "1";

/* ============================================================================
 * State
 * ========================================================================== */

const state: AppState = {
  activeWorkspace: "form-leads",
  isBusy: false,
  formLeads: {
    parsedRows: [],
    selectedRowIds: new Set(),
    syncResults: new Map(),
    cycles: [],
    progressFilter: "all",
    intervalValue: 30,
    intervalUnit: "seconds",
    autoRunning: false,
    hasScanned: false,
    logTablesOpen: false,
    followUpOpen: true,
  },
  callLeads: {
    enrichmentRows: [],
    bookedReconciliationRows: [],
    selectedRowIds: new Set(),
    cycles: [],
    progressFilter: "all",
    intervalValue: 1,
    intervalUnit: "minutes",
    autoRunning: false,
    hasScanned: false,
    logTablesOpen: false,
    followUpOpen: true,
    bookedOpen: true,
  },
  formEditLead: {
    override: "parsed",
  },
};

const STORAGE_KEY = "granot-sync:popup-state-v1";
const MAX_CYCLES = 40;

/* ============================================================================
 * Storage (persist preferences)
 * ========================================================================== */

async function loadPersistedState(): Promise<void> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const raw = stored?.[STORAGE_KEY] as PersistedState | undefined;
    if (!raw) {
      return;
    }
    if (isWorkspaceId(raw.activeWorkspace)) {
      state.activeWorkspace = raw.activeWorkspace;
    }
    if (raw.formLeads) {
      const fl = raw.formLeads;
      if (typeof fl.intervalValue === "number" && fl.intervalValue > 0) {
        state.formLeads.intervalValue = fl.intervalValue;
      }
      if (isIntervalUnit(fl.intervalUnit)) {
        state.formLeads.intervalUnit = fl.intervalUnit;
      }
      if (isProgressFilter(fl.progressFilter)) {
        state.formLeads.progressFilter = fl.progressFilter;
      }
    }
    if (raw.callLeads) {
      const cl = raw.callLeads;
      if (typeof cl.intervalValue === "number" && cl.intervalValue > 0) {
        state.callLeads.intervalValue = cl.intervalValue;
      }
      if (isIntervalUnit(cl.intervalUnit)) {
        state.callLeads.intervalUnit = cl.intervalUnit;
      }
      if (isProgressFilter(cl.progressFilter)) {
        state.callLeads.progressFilter = cl.progressFilter;
      }
    }
  } catch (err) {
    console.warn("[Granot Sync] Failed to load persisted state:", err);
  }
}

async function savePersistedState(): Promise<void> {
  const payload: PersistedState = {
    activeWorkspace: state.activeWorkspace,
    formLeads: {
      intervalValue: state.formLeads.intervalValue,
      intervalUnit: state.formLeads.intervalUnit,
      progressFilter: state.formLeads.progressFilter,
    },
    callLeads: {
      intervalValue: state.callLeads.intervalValue,
      intervalUnit: state.callLeads.intervalUnit,
      progressFilter: state.callLeads.progressFilter,
    },
  };
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: payload });
  } catch (err) {
    console.warn("[Granot Sync] Failed to save persisted state:", err);
  }
}

function isWorkspaceId(value: unknown): value is WorkspaceId {
  return (
    value === "form-leads" ||
    value === "form-edit-lead" ||
    value === "call-leads" ||
    value === "diagnose" ||
    value === "debug"
  );
}

function isIntervalUnit(value: unknown): value is IntervalUnit {
  return value === "seconds" || value === "minutes" || value === "hours";
}

function isProgressFilter(value: unknown): value is ProgressFilter {
  return value === "all" || value === "syncable" || value === "failed";
}

/* ============================================================================
 * Init
 * ========================================================================== */

void init();

async function init() {
  const manifest = browser.runtime.getManifest();
  dom.appVersion.textContent = `v${manifest.version}`;
  if (isDetachedWindow) {
    dom.openDetached.textContent = "✓ Movable Window Active";
  }

  await loadPersistedState();

  hydrateInterfaceFromState();
  setActiveWorkspace(state.activeWorkspace, { persist: false });
  attachEventHandlers();
  renderAll();
  void refreshConnectionChip();
  void loadCurrentLeadPreview({ preserveOverride: false, quiet: true });
}

function hydrateInterfaceFromState() {
  dom.fl.intervalValue.value = String(state.formLeads.intervalValue);
  dom.fl.intervalUnit.value = state.formLeads.intervalUnit;
  dom.fl.filter.value = state.formLeads.progressFilter;
  dom.cl.intervalValue.value = String(state.callLeads.intervalValue);
  dom.cl.intervalUnit.value = state.callLeads.intervalUnit;
  dom.cl.filter.value = state.callLeads.progressFilter;
}

/* ============================================================================
 * Event handlers
 * ========================================================================== */

function attachEventHandlers() {
  // Sidebar
  for (const tab of dom.sidebarTabs) {
    tab.addEventListener("click", () => {
      const workspace = tab.dataset.workspace;
      if (isWorkspaceId(workspace)) {
        setActiveWorkspace(workspace);
      }
    });
  }

  // Top bar
  dom.openDetached.addEventListener("click", openDetached);

  // Form Leads
  dom.fl.scan.addEventListener("click", () => {
    void scanFollowUpTable({ quiet: false });
  });
  dom.fl.log.addEventListener("click", () => {
    void openFormLeadsLogTables();
  });
  dom.fl.syncSelected.addEventListener("click", () => {
    void syncRows(
      state.formLeads.parsedRows.filter((row) =>
        state.formLeads.selectedRowIds.has(row.id),
      ),
    );
  });
  dom.fl.syncAll.addEventListener("click", () => {
    void syncRows(state.formLeads.parsedRows.filter(isSyncableRow));
  });
  dom.fl.selectAll.addEventListener("click", () => {
    state.formLeads.selectedRowIds = new Set(
      state.formLeads.parsedRows.filter(isSyncableRow).map((row) => row.id),
    );
    renderFormLeads();
  });
  dom.fl.deselectAll.addEventListener("click", () => {
    state.formLeads.selectedRowIds = new Set();
    renderFormLeads();
  });
  dom.fl.intervalValue.addEventListener("change", () => {
    const value = Number(dom.fl.intervalValue.value);
    if (Number.isFinite(value) && value > 0) {
      state.formLeads.intervalValue = value;
      void savePersistedState();
    }
  });
  dom.fl.intervalUnit.addEventListener("change", () => {
    if (isIntervalUnit(dom.fl.intervalUnit.value)) {
      state.formLeads.intervalUnit = dom.fl.intervalUnit.value;
      void savePersistedState();
    }
  });
  dom.fl.filter.addEventListener("change", () => {
    if (isProgressFilter(dom.fl.filter.value)) {
      state.formLeads.progressFilter = dom.fl.filter.value;
      void savePersistedState();
      renderFormLeads();
    }
  });
  dom.fl.autoStart.addEventListener("click", () =>
    startAutoScanAndSync("form-leads"),
  );
  dom.fl.autoStop.addEventListener("click", () =>
    stopAutoScanAndSync("form-leads"),
  );

  // Call Leads
  dom.cl.scan.addEventListener("click", () => {
    void scanCallLeadsPreview({ quiet: false });
  });
  dom.cl.log.addEventListener("click", () => {
    void openCallLeadsLogTables();
  });
  dom.cl.syncBooked.addEventListener("click", () => {
    void syncBookedCallRows(
      state.callLeads.bookedReconciliationRows
        .filter(canSyncBookedCallReconciliationRow)
        .map((row) => row.payload),
    );
  });
  dom.cl.syncSelected.addEventListener("click", () => {
    void syncCallRows(
      state.callLeads.enrichmentRows
        .filter((row) => state.callLeads.selectedRowIds.has(row.payload.row_id))
        .map((row) => row.payload),
    );
  });
  dom.cl.syncAll.addEventListener("click", () => {
    void syncCallRows(
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
    renderCallLeads();
  });
  dom.cl.deselectAll.addEventListener("click", () => {
    state.callLeads.selectedRowIds = new Set();
    renderCallLeads();
  });
  dom.cl.intervalValue.addEventListener("change", () => {
    const value = Number(dom.cl.intervalValue.value);
    if (Number.isFinite(value) && value > 0) {
      state.callLeads.intervalValue = value;
      void savePersistedState();
    }
  });
  dom.cl.intervalUnit.addEventListener("change", () => {
    if (isIntervalUnit(dom.cl.intervalUnit.value)) {
      state.callLeads.intervalUnit = dom.cl.intervalUnit.value;
      void savePersistedState();
    }
  });
  dom.cl.filter.addEventListener("change", () => {
    if (isProgressFilter(dom.cl.filter.value)) {
      state.callLeads.progressFilter = dom.cl.filter.value;
      void savePersistedState();
      renderCallLeads();
    }
  });
  dom.cl.autoStart.addEventListener("click", () =>
    startAutoScanAndSync("call-leads"),
  );
  dom.cl.autoStop.addEventListener("click", () =>
    stopAutoScanAndSync("call-leads"),
  );

  // Form Edit Lead
  dom.fe.scan.addEventListener("click", () => {
    void loadCurrentLeadPreview({ preserveOverride: false });
  });
  dom.fe.sync.addEventListener("click", () => {
    void syncCurrentLead();
  });

  // Diagnose
  dom.diagnoseRun.addEventListener("click", () => {
    void runAndRenderDiagnostics();
  });

  // Debug
  dom.debugDump.addEventListener("click", () => {
    void runDebugDumpTables();
  });
}

/* ============================================================================
 * Workspace router
 * ========================================================================== */

function setActiveWorkspace(
  workspace: WorkspaceId,
  options?: { persist?: boolean },
) {
  state.activeWorkspace = workspace;
  for (const tab of dom.sidebarTabs) {
    tab.classList.toggle("is-active", tab.dataset.workspace === workspace);
  }
  for (const ws of dom.workspaces) {
    ws.classList.toggle("is-active", ws.dataset.workspace === workspace);
  }
  if (options?.persist !== false) {
    void savePersistedState();
  }
}

/* ============================================================================
 * Top-level render
 * ========================================================================== */

function renderAll() {
  renderFormLeads();
  renderCallLeads();
  renderFormEditLead();
  updateGlobalControls();
  updateSidebarPulses();
}

function updateSidebarPulses() {
  for (const tab of dom.sidebarTabs) {
    const workspace = tab.dataset.workspace;
    const shouldPulse =
      (workspace === "form-leads" && state.formLeads.autoRunning) ||
      (workspace === "call-leads" && state.callLeads.autoRunning);
    tab.classList.toggle("has-pulse", Boolean(shouldPulse));
  }
}

function updateGlobalControls() {
  const isBusy = state.isBusy;
  dom.openDetached.disabled = isBusy || isDetachedWindow;
  dom.statusSpinner.classList.toggle("is-visible", isBusy);
}

function setStatus(message: string, options?: { tone?: "info" | "error" }) {
  dom.status.textContent = message;
  dom.status.classList.toggle("is-error", options?.tone === "error");
}

function setBusy(nextIsBusy: boolean) {
  state.isBusy = nextIsBusy;
  updateGlobalControls();
  // Re-render the whole Form Leads / Call Leads workspaces (not just their
  // top-level controls) so per-row Sync buttons pick up the new busy state.
  // Without this, the row list rendered earlier in an async scan/sync stays
  // disabled until something else re-renders it.
  renderFormLeads();
  renderCallLeads();
  renderFormEditLeadControls();
}

/* ============================================================================
 * Form Leads workspace
 * ========================================================================== */

function renderFormLeads() {
  renderFormLeadsSummary();
  renderFormLeadsRows();
  renderFormLeadsHistory();
  renderFormLeadsControls();
  renderFormLeadsAutoMeta();
  updateSidebarPulses();
}

function renderFormLeadsSummary() {
  const fl = state.formLeads;
  if (!fl.hasScanned || fl.parsedRows.length === 0) {
    dom.fl.summary.hidden = true;
    dom.fl.summary.textContent = "";
    return;
  }
  const syncable = fl.parsedRows.filter(isSyncableRow).length;
  const unsupported = fl.parsedRows.filter(
    (row) => row.status === "unsupported_prior",
  ).length;
  const invalid = fl.parsedRows.filter(
    (row) => row.status === "invalid_ref_no" || row.status === "missing_prior",
  ).length;
  const selected = fl.parsedRows.filter((row) =>
    fl.selectedRowIds.has(row.id),
  ).length;

  dom.fl.summary.hidden = false;
  dom.fl.summary.textContent = `${fl.parsedRows.length} parsed row(s): ${syncable} syncable, ${unsupported} unsupported prior, ${invalid} invalid. ${selected} selected.`;
}

function renderFormLeadsRows() {
  const fl = state.formLeads;
  const autoRunning = fl.autoRunning;

  dom.fl.pausedBanner.style.display = autoRunning ? "block" : "none";

  if (autoRunning) {
    dom.fl.rowlistCard.style.display = "none";
    dom.fl.empty.style.display = "none";
    return;
  }

  if (!fl.hasScanned) {
    dom.fl.rowlistCard.style.display = "none";
    dom.fl.empty.style.display = "block";
    return;
  }

  if (fl.parsedRows.length === 0) {
    dom.fl.rowlistCard.style.display = "none";
    dom.fl.empty.style.display = "block";
    dom.fl.empty.innerHTML =
      "<strong>No rows found</strong>The scan found a Follow Up Estimates table but no parseable rows.";
    return;
  }

  dom.fl.empty.style.display = "none";
  dom.fl.rowlistCard.style.display = "block";
  dom.fl.rows.textContent = "";

  const rowsToRender = fl.parsedRows.filter((row) =>
    shouldShowFollowUpRow(row),
  );

  const syncableCount = fl.parsedRows.filter(isSyncableRow).length;
  const summaryText = `Follow Up Estimates · ${fl.parsedRows.length} row(s) · ${syncableCount} syncable`;
  const accordion = buildTablePreviewAccordion({
    summaryText,
    open: fl.followUpOpen,
    onToggle: (open) => {
      fl.followUpOpen = open;
    },
  });

  if (rowsToRender.length === 0) {
    const note = document.createElement("p");
    note.className = "status-text";
    note.style.margin = "8px 0 0";
    note.textContent =
      "No rows match the selected progress filter. Switch the filter back to Show All to see everything.";
    accordion.body.append(note);
  } else {
    for (const row of rowsToRender) {
      accordion.body.append(buildFormLeadRowElement(row));
    }
  }

  dom.fl.rows.append(accordion.details);
}

function buildFormLeadRowElement(row: FollowUpRow): HTMLDivElement {
  const fl = state.formLeads;
  const syncable = isSyncableRow(row);
  const result = fl.syncResults.get(row.id);

  const rowEl = document.createElement("div");
  rowEl.className = `row ${syncable ? "" : "unsyncable"}`;

  const headerEl = document.createElement("div");
  headerEl.className = "row-header";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.disabled = !syncable || state.isBusy;
  checkbox.checked = fl.selectedRowIds.has(row.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      fl.selectedRowIds.add(row.id);
    } else {
      fl.selectedRowIds.delete(row.id);
    }
    renderFormLeads();
  });
  headerEl.append(checkbox);

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  titleEl.textContent = `#${row.displayNumber || row.rowIndex} ${
    row.customer || "Unknown customer"
  }`;
  headerEl.append(titleEl);

  headerEl.append(statusBadge(row));
  if (result) {
    headerEl.append(resultBadge(result));
  }

  const actions = document.createElement("div");
  actions.className = "row-header__actions";

  // Inline no-op / status hint next to Sync button.
  const noOpMessage = getFormLeadNoOpMessage(result);
  if (syncable && noOpMessage) {
    const hint = document.createElement("span");
    hint.className = "row-noop-hint";
    hint.textContent = noOpMessage;
    actions.append(hint);
  }

  if (syncable) {
    const syncBtn = document.createElement("button");
    syncBtn.className = "btn-sm";
    syncBtn.textContent = "Sync";
    // Only dim while a global sync/scan is in flight; never disable just
    // because the row is unchanged / already up to date.
    syncBtn.disabled = state.isBusy;
    syncBtn.addEventListener("click", () => {
      void syncRows([row]);
    });
    actions.append(syncBtn);
  }
  headerEl.append(actions);

  rowEl.append(headerEl);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(formLeadRowFields(row))) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  rowEl.append(fieldGrid);

  const messageParts = [row.reason, result?.message].filter(
    Boolean,
  ) as string[];
  if (messageParts.length > 0) {
    const metaEl = document.createElement("div");
    metaEl.className = "row-meta";
    metaEl.textContent = messageParts.join(" | ");
    rowEl.append(metaEl);
  }

  return rowEl;
}

function formLeadRowFields(row: FollowUpRow): Record<string, string> {
  return {
    no: row.displayNumber || String(row.rowIndex),
    job_no: row.jobNo ?? "",
    source: row.source ?? "",
    ref_no: row.refNo || "",
    prior: row.prior || "",
    est_cf: row.estCf ?? "",
    cubic_feet: typeof row.cubicFeet === "number" ? String(row.cubicFeet) : "",
    quoted: typeof row.quoted === "boolean" ? String(row.quoted) : "",
    customer: row.customer ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
  };
}

function getFormLeadNoOpMessage(result?: RowSyncResult): string | undefined {
  if (!result) return undefined;
  if (result.status === "unchanged") {
    return result.message;
  }
  return undefined;
}

function renderFormLeadsHistory() {
  const fl = state.formLeads;
  dom.fl.history.textContent = "";
  dom.fl.historyMeta.textContent = `${fl.cycles.length} cycle(s)`;
  if (fl.cycles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.style.margin = "0";
    empty.textContent = "No ScanAndSync cycles yet.";
    dom.fl.history.append(empty);
    return;
  }
  fl.cycles.forEach((cycle, index) => {
    dom.fl.history.append(
      buildCycleElement(cycle, index === 0, fl.progressFilter),
    );
  });
}

function renderFormLeadsControls() {
  const fl = state.formLeads;
  const isBusy = state.isBusy;
  const autoRunning = fl.autoRunning;
  const hasRows = fl.parsedRows.length > 0;
  const hasSyncableRows = fl.parsedRows.some(isSyncableRow);
  const hasSelectedRows = fl.parsedRows.some((row) =>
    fl.selectedRowIds.has(row.id),
  );

  dom.fl.scan.disabled = isBusy || autoRunning;
  dom.fl.log.disabled = isBusy;
  dom.fl.syncSelected.disabled = isBusy || autoRunning || !hasSelectedRows;
  dom.fl.syncAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.fl.selectAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.fl.deselectAll.disabled = isBusy || autoRunning || !hasRows;
  dom.fl.intervalValue.disabled = autoRunning;
  dom.fl.intervalUnit.disabled = autoRunning;
  dom.fl.autoStart.disabled = isBusy || autoRunning;
  dom.fl.autoStop.disabled = !autoRunning;
}

function renderFormLeadsAutoMeta() {
  const fl = state.formLeads;
  if (fl.autoRunning) {
    dom.fl.autoMeta.textContent = `running every ${formatIntervalLabel(
      fl.intervalValue,
      fl.intervalUnit,
    )} · started ${fl.autoStartedAt ?? ""}`;
    dom.fl.autoBadge.classList.remove("is-hidden");
    dom.fl.autoBadgeText.textContent = `Auto-syncing every ${formatIntervalLabel(
      fl.intervalValue,
      fl.intervalUnit,
    )}`;
  } else {
    dom.fl.autoMeta.textContent = "";
    dom.fl.autoBadge.classList.add("is-hidden");
  }
}

async function openFormLeadsLogTables() {
  state.formLeads.logTablesOpen = true;
  if (!state.formLeads.hasScanned) {
    setStatus("Scanning Follow Up table for Log Tables view…");
    await scanFollowUpTable({ quiet: true });
  }
  renderFormLeadsLogTables();
}

function renderFormLeadsLogTables() {
  const fl = state.formLeads;
  dom.fl.logContainer.textContent = "";
  if (!fl.logTablesOpen || !fl.hasScanned) {
    return;
  }

  const consoleRows = fl.parsedRows.map((row) => ({
    "#": row.displayNumber || row.rowIndex,
    job_no: row.jobNo || "",
    source: row.source || "",
    ref_no: row.refNo || "",
    prior: row.prior || "",
    est_cf: row.estCf || "",
    cubic_feet: typeof row.cubicFeet === "number" ? row.cubicFeet : "",
    customer: row.customer || "",
    phone: row.phone || "",
    email: row.email || "",
    status: row.status,
    reason: row.reason || "",
  }));
  console.groupCollapsed("[Granot Sync] Form Leads — Follow Up Estimates");
  console.table(consoleRows);
  console.groupEnd();

  const details = document.createElement("details");
  details.className = "log-tables";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = `Log Tables — Form Leads · ${consoleRows.length} row(s) (also logged to console)`;
  const close = document.createElement("button");
  close.className = "btn-ghost btn-sm";
  close.textContent = "Close";
  close.style.marginLeft = "auto";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    state.formLeads.logTablesOpen = false;
    renderFormLeadsLogTables();
  });
  summary.append(close);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "log-tables__body";
  body.append(buildLogGrid(consoleRows, (row) => row.status !== "syncable"));
  details.append(body);

  dom.fl.logContainer.append(details);
}

/* ============================================================================
 * Call Leads workspace
 * ========================================================================== */

function renderCallLeads() {
  renderCallLeadsSummary();
  renderCallLeadsRows();
  renderCallLeadsHistory();
  renderCallLeadsControls();
  renderCallLeadsAutoMeta();
  updateSidebarPulses();
}

function renderCallLeadsSummary() {
  const cl = state.callLeads;
  if (!cl.hasScanned || !cl.preview) {
    dom.cl.summary.hidden = true;
    dom.cl.summary.textContent = "";
    return;
  }
  const foundSections = cl.preview.sections.filter(
    (section) => section.tableFound,
  );
  const followUp = cl.preview.sections.find(
    (s) => s.key === "followUpEstimates",
  );
  const booked = cl.preview.sections.find((s) => s.key === "bookedJobs");
  const followUpCount = followUp?.rows.length ?? 0;
  const bookedCount = booked?.rows.length ?? 0;
  const updateable = cl.enrichmentRows.filter(canSyncCallEnrichmentRow).length;
  const bookedUpdateable = cl.bookedReconciliationRows.filter(
    canSyncBookedCallReconciliationRow,
  ).length;
  const selected = cl.enrichmentRows.filter((row) =>
    cl.selectedRowIds.has(row.payload.row_id),
  ).length;

  dom.cl.summary.hidden = false;
  dom.cl.summary.textContent = `${foundSections.length} table(s) found · ${followUpCount} follow-up row(s) · ${updateable} updateable · ${bookedCount} booked row(s) · ${bookedUpdateable} booked updateable · ${selected} selected.`;
}

function renderCallLeadsRows() {
  const cl = state.callLeads;
  const autoRunning = cl.autoRunning;

  dom.cl.pausedBanner.style.display = autoRunning ? "block" : "none";

  if (autoRunning) {
    dom.cl.rowlistCard.style.display = "none";
    dom.cl.bookedContainer.textContent = "";
    dom.cl.empty.style.display = "none";
    return;
  }

  if (!cl.hasScanned) {
    dom.cl.rowlistCard.style.display = "none";
    dom.cl.bookedContainer.textContent = "";
    dom.cl.empty.style.display = "block";
    dom.cl.empty.innerHTML =
      "<strong>No scan yet</strong>Click <em>Scan Call Leads View</em> to read rows from the active Granot tab.";
    return;
  }

  if (!cl.preview?.pageFound) {
    dom.cl.rowlistCard.style.display = "none";
    dom.cl.bookedContainer.textContent = "";
    dom.cl.empty.style.display = "block";
    dom.cl.empty.innerHTML =
      "<strong>No Booked Jobs / Follow Up Estimates tables found</strong>This tab does not look like the Granot Call Leads page.";
    return;
  }

  dom.cl.empty.style.display = "none";

  // Follow Up Estimates
  const followUp = cl.preview.sections.find(
    (s) => s.key === "followUpEstimates",
  );
  if (followUp?.tableFound && followUp.rows.length > 0) {
    dom.cl.rowlistCard.style.display = "block";
    dom.cl.rows.textContent = "";

    const visibleRows = followUp.rows.filter((row) =>
      shouldShowCallFollowUpRow(row),
    );

    const updateable = cl.enrichmentRows.filter(
      canSyncCallEnrichmentRow,
    ).length;
    const summaryText = `Follow Up Estimates · ${followUp.rows.length} row(s) · ${updateable} updateable`;
    const accordion = buildTablePreviewAccordion({
      summaryText,
      open: cl.followUpOpen,
      onToggle: (open) => {
        cl.followUpOpen = open;
      },
    });

    if (visibleRows.length === 0) {
      const note = document.createElement("p");
      note.className = "status-text";
      note.style.margin = "8px 0 0";
      note.textContent =
        "No rows match the selected progress filter. Switch the filter back to Show All to see everything.";
      accordion.body.append(note);
    } else {
      for (const row of visibleRows) {
        accordion.body.append(buildCallLeadRowElement(row));
      }
    }

    dom.cl.rows.append(accordion.details);
  } else {
    dom.cl.rowlistCard.style.display = "none";
  }

  // Booked Jobs (table-level accordion; default open after scan)
  renderCallLeadsBookedAccordion();
}

function renderCallLeadsBookedAccordion() {
  const cl = state.callLeads;
  dom.cl.bookedContainer.textContent = "";

  const booked = cl.preview?.sections.find((s) => s.key === "bookedJobs");
  if (!booked) return;

  if (!booked.tableFound) {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = "Booked Jobs";
    const meta = document.createElement("span");
    meta.className = "card__title-meta";
    meta.textContent = "not found on this page";
    title.append(meta);
    card.append(title);
    dom.cl.bookedContainer.append(card);
    return;
  }

  const bookedUpdateable = cl.bookedReconciliationRows.filter(
    canSyncBookedCallReconciliationRow,
  ).length;
  const summaryText = `Booked Jobs · ${booked.rows.length} job(s) · ${bookedUpdateable} updateable by job_no`;
  const accordion = buildTablePreviewAccordion({
    summaryText,
    open: cl.bookedOpen,
    onToggle: (open) => {
      cl.bookedOpen = open;
    },
  });

  for (const row of booked.rows) {
    const reconciliation = cl.bookedReconciliationRows.find(
      (preview) => preview.payload.row_id === row.id,
    );
    accordion.body.append(buildBookedRowElement(row, reconciliation));
  }

  dom.cl.bookedContainer.append(accordion.details);
}

function buildBookedRowElement(
  row: CallLeadPreviewRow,
  reconciliation?: BookedCallLeadReconciliationPreview,
): HTMLDivElement {
  const result = reconciliation?.result;
  const canSync = canSyncBookedCallReconciliationRow(reconciliation);

  const rowEl = document.createElement("div");
  rowEl.className = `row ${canSync ? "" : "unsyncable"}`;

  const headerEl = document.createElement("div");
  headerEl.className = "row-header";

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  const displayNumber = row.values.no || String(row.rowIndex);
  const jobNo = row.values.job_no ? ` ${row.values.job_no}` : "";
  const customer = row.values.customer ? ` - ${row.values.customer}` : "";
  titleEl.textContent = `#${displayNumber}${jobNo}${customer}`;
  headerEl.append(titleEl);

  if (result) {
    headerEl.append(callLeadResultBadge(result.status));
  } else {
    const badge = document.createElement("span");
    badge.className = "badge muted";
    badge.textContent = "booked";
    headerEl.append(badge);
  }

  const actions = document.createElement("div");
  actions.className = "row-header__actions";

  const noOpMessage = getCallLeadNoOpMessage(result?.status, result?.message);
  if (canSync && noOpMessage) {
    const hint = document.createElement("span");
    hint.className = "row-noop-hint";
    hint.textContent = noOpMessage;
    actions.append(hint);
  }

  if (canSync && reconciliation) {
    const syncBtn = document.createElement("button");
    syncBtn.className = "btn-sm";
    syncBtn.textContent = "Sync";
    // Only dim while a global sync/scan is in flight; never disable just
    // because the row is unchanged / already up to date.
    syncBtn.disabled = state.isBusy;
    syncBtn.addEventListener("click", () => {
      void syncBookedCallRows([reconciliation.payload]);
    });
    actions.append(syncBtn);
  }
  headerEl.append(actions);
  rowEl.append(headerEl);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(row.values)) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  rowEl.append(fieldGrid);

  if (result) {
    const metaParts = [
      result.message,
      result.booking_id ? `booking: ${result.booking_id}` : undefined,
      result.call_lead_id ? `call lead: ${result.call_lead_id}` : undefined,
      result.changes.length
        ? `changes: ${result.changes.join(", ")}`
        : undefined,
      ...result.warnings,
    ].filter(Boolean) as string[];
    if (metaParts.length > 0) {
      const metaEl = document.createElement("div");
      metaEl.className = "row-meta";
      metaEl.textContent = metaParts.join(" | ");
      rowEl.append(metaEl);
    }
  }

  return rowEl;
}

function buildCallLeadRowElement(row: CallLeadPreviewRow): HTMLDivElement {
  const cl = state.callLeads;
  const enrichment = cl.enrichmentRows.find(
    (preview) => preview.payload.row_id === row.id,
  );
  const result = enrichment?.result;
  const canSync = canSyncCallEnrichmentRow(enrichment);

  const rowEl = document.createElement("div");
  rowEl.className = `row ${canSync ? "" : "unsyncable"}`;

  const headerEl = document.createElement("div");
  headerEl.className = "row-header";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.disabled = !canSync || state.isBusy;
  checkbox.checked = cl.selectedRowIds.has(row.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      cl.selectedRowIds.add(row.id);
    } else {
      cl.selectedRowIds.delete(row.id);
    }
    renderCallLeads();
  });
  headerEl.append(checkbox);

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  const displayNumber = row.values.no || String(row.rowIndex);
  const jobNo = row.values.job_no ? ` ${row.values.job_no}` : "";
  const customer = row.values.customer ? ` - ${row.values.customer}` : "";
  titleEl.textContent = `#${displayNumber}${jobNo}${customer}`;
  headerEl.append(titleEl);

  if (result) {
    headerEl.append(callLeadResultBadge(result.status));
  }

  const actions = document.createElement("div");
  actions.className = "row-header__actions";

  const noOpMessage = getCallLeadNoOpMessage(result?.status, result?.message);
  if (canSync && noOpMessage) {
    const hint = document.createElement("span");
    hint.className = "row-noop-hint";
    hint.textContent = noOpMessage;
    actions.append(hint);
  }

  if (canSync && enrichment) {
    const syncBtn = document.createElement("button");
    syncBtn.className = "btn-sm";
    syncBtn.textContent = "Sync";
    // Only dim while a global sync/scan is in flight; never disable just
    // because the row is unchanged / already up to date.
    syncBtn.disabled = state.isBusy;
    syncBtn.addEventListener("click", () => {
      void syncCallRows([enrichment.payload]);
    });
    actions.append(syncBtn);
  }
  headerEl.append(actions);
  rowEl.append(headerEl);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(row.values)) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  rowEl.append(fieldGrid);

  if (result) {
    const metaParts = [
      result.message,
      result.call_lead_id ? `call lead: ${result.call_lead_id}` : undefined,
      result.matched_phone_number
        ? `matched phone: ${result.matched_phone_number}`
        : undefined,
      result.changes.length
        ? `changes: ${result.changes.join(", ")}`
        : undefined,
      ...result.warnings,
    ].filter(Boolean) as string[];
    if (metaParts.length > 0) {
      const metaEl = document.createElement("div");
      metaEl.className = "row-meta";
      metaEl.textContent = metaParts.join(" | ");
      rowEl.append(metaEl);
    }
  }

  return rowEl;
}

function getCallLeadNoOpMessage(
  status?: string,
  message?: string,
): string | undefined {
  if (status === "unchanged" && message) {
    return message;
  }
  if (status === "updated" && message) {
    return message;
  }
  return undefined;
}

function renderCallLeadsHistory() {
  const cl = state.callLeads;
  dom.cl.history.textContent = "";
  dom.cl.historyMeta.textContent = `${cl.cycles.length} cycle(s)`;
  if (cl.cycles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.style.margin = "0";
    empty.textContent = "No ScanAndSync cycles yet.";
    dom.cl.history.append(empty);
    return;
  }
  cl.cycles.forEach((cycle, index) => {
    dom.cl.history.append(
      buildCycleElement(cycle, index === 0, cl.progressFilter),
    );
  });
}

function renderCallLeadsControls() {
  const cl = state.callLeads;
  const isBusy = state.isBusy;
  const autoRunning = cl.autoRunning;
  const hasRows = cl.enrichmentRows.length > 0;
  const hasSyncableRows = cl.enrichmentRows.some(canSyncCallEnrichmentRow);
  const hasSyncableBookedRows = cl.bookedReconciliationRows.some(
    canSyncBookedCallReconciliationRow,
  );
  const hasSelectedRows = cl.enrichmentRows.some((row) =>
    cl.selectedRowIds.has(row.payload.row_id),
  );

  dom.cl.scan.disabled = isBusy || autoRunning;
  dom.cl.log.disabled = isBusy;
  dom.cl.syncBooked.disabled = isBusy || autoRunning || !hasSyncableBookedRows;
  dom.cl.syncSelected.disabled = isBusy || autoRunning || !hasSelectedRows;
  dom.cl.syncAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.cl.selectAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.cl.deselectAll.disabled = isBusy || autoRunning || !hasRows;
  dom.cl.intervalValue.disabled = autoRunning;
  dom.cl.intervalUnit.disabled = autoRunning;
  dom.cl.autoStart.disabled = isBusy || autoRunning;
  dom.cl.autoStop.disabled = !autoRunning;
}

function renderCallLeadsAutoMeta() {
  const cl = state.callLeads;
  if (cl.autoRunning) {
    dom.cl.autoMeta.textContent = `running every ${formatIntervalLabel(
      cl.intervalValue,
      cl.intervalUnit,
    )} · started ${cl.autoStartedAt ?? ""}`;
    dom.cl.autoBadge.classList.remove("is-hidden");
    dom.cl.autoBadgeText.textContent = `Auto-syncing every ${formatIntervalLabel(
      cl.intervalValue,
      cl.intervalUnit,
    )}`;
  } else {
    dom.cl.autoMeta.textContent = "";
    dom.cl.autoBadge.classList.add("is-hidden");
  }
}

async function openCallLeadsLogTables() {
  state.callLeads.logTablesOpen = true;
  if (!state.callLeads.hasScanned) {
    setStatus("Scanning Call Leads tables for Log Tables view…");
    await scanCallLeadsPreview({ quiet: true });
  }
  renderCallLeadsLogTables();
}

function renderCallLeadsLogTables() {
  const cl = state.callLeads;
  dom.cl.logContainer.textContent = "";
  if (!cl.logTablesOpen || !cl.hasScanned || !cl.preview) {
    return;
  }

  const followUp = cl.preview.sections.find(
    (s) => s.key === "followUpEstimates",
  );
  const booked = cl.preview.sections.find((s) => s.key === "bookedJobs");

  const followUpRows = (followUp?.rows ?? []).map((row) => {
    const enrichment = cl.enrichmentRows.find(
      (preview) => preview.payload.row_id === row.id,
    );
    return {
      table: "follow_up_estimates",
      "#": row.values.no || row.rowIndex,
      job_no: row.values.job_no || "",
      customer: row.values.customer || "",
      phone: row.values.phone || "",
      email: row.values.email || "",
      from_zip: row.values.from_zip || "",
      to_zip: row.values.to_zip || "",
      est_cf: row.values.est_cf || "",
      enrichment_status: enrichment?.result?.status ?? "—",
      enrichment_message: enrichment?.result?.message ?? "",
    };
  });

  const bookedRows = (booked?.rows ?? []).map((row) => {
    const reconciliation = cl.bookedReconciliationRows.find(
      (preview) => preview.payload.row_id === row.id,
    );
    return {
      table: "booked_jobs",
      "#": row.values.no || row.rowIndex,
      job_no: row.values.job_no || "",
      customer: row.values.customer || "",
      phone: row.values.phone || "",
      email: row.values.email || "",
      from_zip: row.values.from_zip || "",
      to_zip: row.values.to_zip || "",
      est_cf: row.values.est_cf || "",
      reconciliation_status: reconciliation?.result?.status ?? "—",
      reconciliation_message: reconciliation?.result?.message ?? "",
    };
  });

  console.groupCollapsed("[Granot Sync] Call Leads — Follow Up Estimates");
  console.table(followUpRows);
  console.groupEnd();
  console.groupCollapsed("[Granot Sync] Call Leads — Booked Jobs");
  console.table(bookedRows);
  console.groupEnd();

  const details = document.createElement("details");
  details.className = "log-tables";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = `Log Tables — Call Leads · ${followUpRows.length} follow-up + ${bookedRows.length} booked (also logged to console)`;
  const close = document.createElement("button");
  close.className = "btn-ghost btn-sm";
  close.textContent = "Close";
  close.style.marginLeft = "auto";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    state.callLeads.logTablesOpen = false;
    renderCallLeadsLogTables();
  });
  summary.append(close);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "log-tables__body";

  if (followUpRows.length > 0) {
    const heading = document.createElement("div");
    heading.style.padding = "8px 14px 4px";
    heading.style.fontSize = "11px";
    heading.style.fontWeight = "700";
    heading.style.textTransform = "uppercase";
    heading.style.color = "#475569";
    heading.style.letterSpacing = "0.04em";
    heading.textContent = "Follow Up Estimates";
    body.append(heading);
    body.append(
      buildLogGrid(
        followUpRows,
        (row) =>
          row.enrichment_status !== "updateable" &&
          row.enrichment_status !== "updated",
      ),
    );
  }
  if (bookedRows.length > 0) {
    const heading = document.createElement("div");
    heading.style.padding = "8px 14px 4px";
    heading.style.fontSize = "11px";
    heading.style.fontWeight = "700";
    heading.style.textTransform = "uppercase";
    heading.style.color = "#475569";
    heading.style.letterSpacing = "0.04em";
    heading.textContent = "Booked Jobs";
    body.append(heading);
    body.append(buildLogGrid(bookedRows, () => false));
  }
  details.append(body);

  dom.cl.logContainer.append(details);
}

/* ============================================================================
 * Form Edit Lead workspace
 * ========================================================================== */

function renderFormEditLead() {
  renderFormEditLeadContent();
  renderFormEditLeadControls();
}

function renderFormEditLeadContent() {
  const fe = state.formEditLead;
  dom.fe.content.textContent = "";

  if (!fe.preview) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<strong>No lead detected</strong>Open a Granot <em>Edit Form Lead</em> page on the active tab, then click <em>Re-scan Current Page</em>.";
    dom.fe.content.append(empty);
    return;
  }

  const { lead } = fe.preview;

  // Current Lead card
  const leadCard = document.createElement("div");
  leadCard.className = "card";
  const leadTitle = document.createElement("h3");
  leadTitle.className = "card__title";
  leadTitle.textContent = "Current Lead";
  leadTitle.append(statusBadge(lead));
  leadCard.append(leadTitle);

  const leadMeta = document.createElement("div");
  leadMeta.className = "row-meta";
  leadMeta.textContent = [
    `ref_no: ${lead.refNo || "missing"}`,
    `Granot prior: ${lead.prior ? `Level-${lead.prior}` : "missing"}`,
    lead.reason,
    fe.preview.error,
  ]
    .filter(Boolean)
    .join(" | ");
  leadCard.append(leadMeta);
  dom.fe.content.append(leadCard);

  // Diff card
  const diffCard = document.createElement("div");
  diffCard.className = "card";
  const diffTitle = document.createElement("h3");
  diffTitle.className = "card__title";
  diffTitle.textContent = "Diff Preview";
  diffCard.append(diffTitle);

  const targetQuoted = getCurrentLeadTargetQuoted();
  const currentQuoted = fe.preview.currentQuoted;

  const table = document.createElement("table");
  table.className = "diff-table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Field</th><th>Current (Vantage)</th><th class='diff-arrow'>→</th><th>Target</th></tr>";
  table.append(thead);

  const tbody = document.createElement("tbody");

  const quotedRow = buildDiffRow(
    "quoted",
    typeof currentQuoted === "boolean" ? String(currentQuoted) : "unknown",
    typeof targetQuoted === "boolean" ? String(targetQuoted) : "not selected",
    typeof currentQuoted === "boolean" &&
      typeof targetQuoted === "boolean" &&
      currentQuoted !== targetQuoted,
  );
  tbody.append(quotedRow);

  const cubicFeetRow = buildDiffRow(
    "cubic_feet",
    typeof fe.preview.currentCubicFeet === "number"
      ? String(fe.preview.currentCubicFeet)
      : "—",
    "— (not present on edit page)",
    false,
  );
  tbody.append(cubicFeetRow);

  table.append(tbody);
  diffCard.append(table);

  if (fe.result) {
    const resultEl = document.createElement("div");
    resultEl.className = `banner ${
      fe.result.status === "failed"
        ? "error"
        : fe.result.status === "updated"
          ? "info"
          : "warn"
    }`;
    resultEl.style.marginTop = "12px";
    resultEl.style.marginBottom = "0";
    resultEl.textContent = `${fe.result.status}: ${fe.result.message}`;
    diffCard.append(resultEl);
  }

  dom.fe.content.append(diffCard);

  // Override card
  const overrideCard = document.createElement("div");
  overrideCard.className = "card";
  const overrideTitle = document.createElement("h3");
  overrideTitle.className = "card__title";
  overrideTitle.textContent = "Sync Target";
  overrideCard.append(overrideTitle);

  const radioGroup = document.createElement("div");
  radioGroup.className = "radio-group";

  const overrideOptions: Array<{ value: OverrideMode; label: string }> = [
    {
      value: "parsed",
      label: `Use parsed priority${
        lead.prior ? ` (Level-${lead.prior} → quoted=${lead.quoted})` : ""
      }`,
    },
    { value: "quoted_true", label: "Override to Quoted (true)" },
    { value: "quoted_false", label: "Override to Not Quoted (false)" },
  ];

  const disabled = state.isBusy || lead.status === "invalid_ref_no";
  for (const opt of overrideOptions) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "current-lead-override";
    radio.value = opt.value;
    radio.checked = fe.override === opt.value;
    radio.disabled = disabled;
    radio.addEventListener("change", () => {
      if (radio.checked) {
        fe.override = opt.value;
        fe.result = undefined;
        renderFormEditLead();
      }
    });
    label.append(radio, document.createTextNode(" " + opt.label));
    radioGroup.append(label);
  }
  overrideCard.append(radioGroup);
  dom.fe.content.append(overrideCard);
}

function buildDiffRow(
  field: string,
  current: string,
  target: string,
  isChanged: boolean,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = isChanged ? "is-changed" : "is-unchanged";

  const fieldCell = document.createElement("td");
  fieldCell.textContent = field;
  const currentCell = document.createElement("td");
  currentCell.textContent = current;
  const arrowCell = document.createElement("td");
  arrowCell.className = "diff-arrow";
  arrowCell.textContent = isChanged ? "→" : "=";
  const targetCell = document.createElement("td");
  targetCell.textContent = target;

  tr.append(fieldCell, currentCell, arrowCell, targetCell);
  return tr;
}

function renderFormEditLeadControls() {
  const fe = state.formEditLead;
  const isBusy = state.isBusy;
  dom.fe.scan.disabled = isBusy;
  dom.fe.sync.disabled = isBusy || !canSyncCurrentLead();
  if (!fe.preview) {
    dom.fe.sync.disabled = true;
  }
}

/* ============================================================================
 * Reusable components
 * ========================================================================== */

function buildCycleElement(
  cycle: CycleEntry,
  expanded: boolean,
  filter: ProgressFilter,
): HTMLElement {
  const details = document.createElement("details");
  details.className = `cycle ${cycle.status === "ok" ? "is-ok" : "is-error"}`;
  details.open = expanded;

  const summary = document.createElement("summary");

  const time = document.createElement("span");
  time.className = "cycle__time";
  time.textContent = cycle.startedAt;
  summary.append(time);

  const icon = document.createElement("span");
  icon.textContent = cycle.status === "ok" ? "✓" : "✗";
  icon.style.color = cycle.status === "ok" ? "#16a34a" : "#dc2626";
  icon.style.fontWeight = "700";
  summary.append(icon);

  const summaryText = document.createElement("span");
  summaryText.className = "cycle__summary";
  summaryText.textContent = cycle.message;
  summary.append(summaryText);

  details.append(summary);

  const body = document.createElement("div");
  body.className = "cycle__body";

  const filteredDetails = filterCycleDetails(cycle.details, filter);

  if (filteredDetails.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.style.margin = "0";
    empty.textContent =
      filter === "all"
        ? "No row-level details captured for this cycle."
        : "No row details match the current progress filter.";
    body.append(empty);
  } else {
    for (const detail of filteredDetails) {
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

function filterCycleDetails(
  details: CycleDetail[],
  filter: ProgressFilter,
): CycleDetail[] {
  if (filter === "all") return details;
  if (filter === "failed") {
    return details.filter((d) => d.status === "failed");
  }
  // syncable
  return details.filter((d) => d.status === "ok" || d.status === "unchanged");
}

function cycleDetailIcon(status: CycleDetail["status"]): string {
  switch (status) {
    case "ok":
      return "✓";
    case "unchanged":
      return "=";
    case "failed":
      return "✗";
    case "skipped":
      return "—";
  }
}

function buildLogGrid<T extends Record<string, unknown>>(
  rows: T[],
  isBad: (row: T) => boolean,
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "log-grid";
  if (rows.length === 0) {
    const tbody = document.createElement("tbody");
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.textContent = "no rows";
    td.style.color = "#94a3b8";
    td.style.padding = "12px";
    tr.append(td);
    tbody.append(tr);
    table.append(tbody);
    return table;
  }
  const headers = Object.keys(rows[0]);
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = isBad(row) ? "is-bad" : "is-ok";
    for (const header of headers) {
      const td = document.createElement("td");
      const value = row[header];
      td.textContent = value == null || value === "" ? "—" : String(value);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

function buildTablePreviewAccordion(options: {
  summaryText: string;
  open: boolean;
  onToggle: (open: boolean) => void;
}): { details: HTMLDetailsElement; body: HTMLDivElement } {
  const details = document.createElement("details");
  details.className = "table-preview";
  details.open = options.open;
  details.addEventListener("toggle", () => {
    options.onToggle(details.open);
  });

  const summary = document.createElement("summary");
  summary.className = "table-preview__summary";
  summary.textContent = options.summaryText;
  details.append(summary);

  const body = document.createElement("div");
  body.className = "table-preview__body";
  details.append(body);

  return { details, body };
}

function fieldBlock(label: string, value: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const labelEl = document.createElement("span");
  labelEl.className = "field-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "field-value";
  valueEl.textContent = value;

  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function statusBadge(row: { status: LeadStatus }): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = row.status === "syncable" ? "badge ok" : "badge warn";
  badge.textContent =
    row.status === "syncable"
      ? "syncable"
      : row.status === "unsupported_prior"
        ? "unsupported prior"
        : row.status === "invalid_ref_no"
          ? "invalid ref_no"
          : "missing prior";
  return badge;
}

function resultBadge(result: RowSyncResult): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className =
    result.status === "updated"
      ? "badge ok"
      : result.status === "failed"
        ? "badge error"
        : "badge muted";
  badge.textContent = result.status;
  return badge;
}

function callLeadResultBadge(status: string): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className =
    status === "updateable" || status === "updated"
      ? "badge ok"
      : status === "failed" || status === "conflict" || status === "invalid"
        ? "badge error"
        : status === "no_match" || status === "booking_missing"
          ? "badge warn"
          : "badge muted";
  badge.textContent = status;
  return badge;
}

function formatIntervalLabel(value: number, unit: IntervalUnit): string {
  const v = Math.max(1, Math.round(value));
  const singular = v === 1;
  if (unit === "seconds") return `${v}s`;
  if (unit === "minutes") return singular ? `${v} minute` : `${v} minutes`;
  return singular ? `${v} hour` : `${v} hours`;
}

function intervalMs(value: number, unit: IntervalUnit): number {
  const v = Math.max(1, Math.round(value));
  if (unit === "seconds") return v * 1000;
  if (unit === "minutes") return v * 60 * 1000;
  return v * 60 * 60 * 1000;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ============================================================================
 * Filters
 * ========================================================================== */

function shouldShowFollowUpRow(row: FollowUpRow): boolean {
  const filter = state.formLeads.progressFilter;
  if (filter === "syncable") {
    return isSyncableRow(row);
  }
  if (filter === "failed") {
    return state.formLeads.syncResults.get(row.id)?.status === "failed";
  }
  return true;
}

function shouldShowCallFollowUpRow(row: CallLeadPreviewRow): boolean {
  const filter = state.callLeads.progressFilter;
  const enrichment = state.callLeads.enrichmentRows.find(
    (preview) => preview.payload.row_id === row.id,
  );
  if (filter === "syncable") {
    return canSyncCallEnrichmentRow(enrichment);
  }
  if (filter === "failed") {
    return (
      enrichment?.result?.status === "failed" ||
      enrichment?.result?.status === "conflict"
    );
  }
  return true;
}

/* ============================================================================
 * Scan operations
 * ========================================================================== */

async function scanFollowUpTable(options: {
  quiet: boolean;
}): Promise<boolean> {
  if (!options.quiet) {
    setStatus("Scanning Follow Up Estimates…");
  }
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<ParseResponse>({
      type: "PARSE_FOLLOW_UP_ROWS",
    });

    if (!response?.tableFound) {
      state.formLeads.parsedRows = [];
      state.formLeads.selectedRowIds = new Set();
      state.formLeads.hasScanned = true;
      renderFormLeads();
      renderFormLeadsLogTables();

      if ((response?.frameResponses ?? 0) === 0) {
        setStatus(
          "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.",
          { tone: "error" },
        );
      } else if (!options.quiet) {
        setStatus("No Follow Up Estimates table found on this tab.", {
          tone: "error",
        });
      }
      return false;
    }

    state.formLeads.parsedRows = response.rows;
    state.formLeads.selectedRowIds = new Set(
      response.rows.filter(isSyncableRow).map((row) => row.id),
    );
    state.formLeads.syncResults = new Map();
    state.formLeads.hasScanned = true;
    state.formLeads.followUpOpen = true;
    renderFormLeads();
    renderFormLeadsLogTables();
    if (!options.quiet) {
      setStatus(
        `Found ${response.counts.total} row(s), ${response.counts.syncable} syncable.`,
      );
    }
    return true;
  } catch (err) {
    setStatus(
      `Could not scan: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return false;
  } finally {
    setBusy(false);
  }
}

async function scanCallLeadsPreview(options: {
  quiet: boolean;
}): Promise<boolean> {
  if (!options.quiet) {
    setStatus("Scanning Call Leads view…");
  }
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<CallLeadPreviewResponse>({
      type: "PARSE_CALL_LEAD_TABLES",
    });

    state.callLeads.preview = response;
    state.callLeads.hasScanned = true;
    state.callLeads.followUpOpen = true;
    state.callLeads.bookedOpen = true;
    const enrichmentPayloads = callLeadRowsToEnrichmentPayloads(response);
    const bookedPayloads = callLeadRowsToBookedReconciliationPayloads(response);
    state.callLeads.enrichmentRows = enrichmentPayloads.map((payload) => ({
      payload,
    }));
    state.callLeads.bookedReconciliationRows = bookedPayloads.map(
      (payload) => ({
        payload,
      }),
    );

    if (enrichmentPayloads.length > 0) {
      try {
        const previewResults =
          await previewCallLeadEnrichment(enrichmentPayloads);
        state.callLeads.enrichmentRows = enrichmentPayloads.map((payload) => ({
          payload,
          result: previewResults.find(
            (result) => result.row_id === payload.row_id,
          ),
        }));
        state.callLeads.selectedRowIds = new Set(
          state.callLeads.enrichmentRows
            .filter(canSyncCallEnrichmentRow)
            .map((row) => row.payload.row_id),
        );
      } catch (err) {
        setStatus(
          `Could not preview call lead enrichment: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { tone: "error" },
        );
      }
    }

    if (bookedPayloads.length > 0) {
      try {
        const previewResults =
          await previewBookedCallLeadReconciliation(bookedPayloads);
        state.callLeads.bookedReconciliationRows = bookedPayloads.map(
          (payload) => ({
            payload,
            result: previewResults.find(
              (result) => result.row_id === payload.row_id,
            ),
          }),
        );
      } catch (err) {
        setStatus(
          `Could not preview booked call lead reconciliation: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { tone: "error" },
        );
      }
    }

    renderCallLeads();
    renderCallLeadsLogTables();

    if (!response?.pageFound) {
      if ((response?.frameResponses ?? 0) === 0) {
        setStatus(
          "Content script did not respond in any frame. Reload the Granot tab and the add-on.",
          { tone: "error" },
        );
      } else if (!options.quiet) {
        setStatus(
          "No Booked Jobs or Follow Up Estimates tables found on this tab.",
          { tone: "error" },
        );
      }
      return false;
    }

    if (!options.quiet) {
      const totalRows = response.sections.reduce(
        (total, section) => total + section.rows.length,
        0,
      );
      const updateable = state.callLeads.enrichmentRows.filter(
        canSyncCallEnrichmentRow,
      ).length;
      const bookedUpdateable = state.callLeads.bookedReconciliationRows.filter(
        canSyncBookedCallReconciliationRow,
      ).length;
      setStatus(
        `Preview ready: found ${totalRows} call lead row(s), ${updateable} updateable Follow Up row(s), ${bookedUpdateable} updateable Booked Jobs row(s).`,
      );
    }
    return true;
  } catch (err) {
    state.callLeads.preview = undefined;
    state.callLeads.enrichmentRows = [];
    state.callLeads.bookedReconciliationRows = [];
    state.callLeads.selectedRowIds = new Set();
    renderCallLeads();
    setStatus(
      `Could not scan the Call Leads view: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { tone: "error" },
    );
    return false;
  } finally {
    setBusy(false);
  }
}

async function loadCurrentLeadPreview(options: {
  preserveOverride: boolean;
  quiet?: boolean;
}): Promise<boolean> {
  if (!options.quiet) {
    setStatus("Scanning current Granot page…");
  }
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<CurrentFormLeadParseResponse>({
      type: "PARSE_CURRENT_FORM_LEAD",
    });

    if (!options.preserveOverride) {
      state.formEditLead.override = "parsed";
      state.formEditLead.result = undefined;
    }

    if (!response?.pageFound || !response.lead) {
      state.formEditLead.preview = undefined;
      renderFormEditLead();
      if (!options.quiet) {
        setStatus("No CRM form edit lead found on this tab.", {
          tone: "error",
        });
      }
      return false;
    }

    state.formEditLead.preview = { lead: response.lead };

    if (response.lead.status !== "invalid_ref_no") {
      try {
        const current = await getFormLeadById(response.lead.refNo);
        state.formEditLead.preview = {
          lead: response.lead,
          currentQuoted: current.quoted,
          currentCubicFeet: current.cubic_feet,
        };
      } catch (err) {
        state.formEditLead.preview = {
          lead: response.lead,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    renderFormEditLead();
    if (!options.quiet) {
      setStatus(response.lead.reason ?? "Current lead preview ready.");
    }
    return true;
  } catch (err) {
    state.formEditLead.preview = undefined;
    renderFormEditLead();
    if (!options.quiet) {
      setStatus(
        `Could not scan current page: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { tone: "error" },
      );
    }
    return false;
  } finally {
    setBusy(false);
  }
}

/* ============================================================================
 * Sync operations
 * ========================================================================== */

async function syncRows(rows: FollowUpRow[]): Promise<SyncCounts | undefined> {
  const syncableRows = rows.filter(isSyncableRow).map(rowToSyncCandidate);
  if (syncableRows.length === 0) {
    setStatus("No supported rows selected for sync.", { tone: "error" });
    return undefined;
  }

  setBusy(true);
  setStatus(`Syncing ${syncableRows.length} row(s)…`);

  const results = await syncLeadCandidates(syncableRows, (id, result) => {
    state.formLeads.syncResults.set(id, result);
    renderFormLeads();
  });

  setStatus(
    `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`,
  );
  setBusy(false);
  renderFormLeads();
  return results;
}

async function syncCallRows(
  rows: CallLeadEnrichmentRowPayload[],
): Promise<SyncCounts | undefined> {
  if (rows.length === 0) {
    setStatus("No supported call lead rows selected for sync.", {
      tone: "error",
    });
    return undefined;
  }

  setBusy(true);
  setStatus(`Syncing ${rows.length} call lead row(s)…`);

  try {
    const results = await syncCallLeadEnrichment(rows);
    state.callLeads.enrichmentRows = state.callLeads.enrichmentRows.map(
      (preview) => ({
        ...preview,
        result:
          results.find((result) => result.row_id === preview.payload.row_id) ??
          preview.result,
      }),
    );
    state.callLeads.selectedRowIds = new Set(
      state.callLeads.enrichmentRows
        .filter(canSyncCallEnrichmentRow)
        .map((row) => row.payload.row_id),
    );
    const updated = results.filter(
      (result) => result.status === "updated",
    ).length;
    const unchanged = results.filter(
      (result) => result.status === "unchanged",
    ).length;
    const failed = results.filter(
      (result) => result.status === "failed" || result.status === "conflict",
    ).length;
    setStatus(
      `Call sync complete. Updated ${updated}, unchanged ${unchanged}, failed/conflict ${failed}.`,
    );
    return { updated, unchanged, failed };
  } catch (err) {
    setStatus(
      `Call sync failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return undefined;
  } finally {
    setBusy(false);
    renderCallLeads();
  }
}

async function syncBookedCallRows(
  rows: BookedCallLeadReconciliationRowPayload[],
): Promise<SyncCounts | undefined> {
  if (rows.length === 0) {
    setStatus("No updateable booked call lead rows found.", { tone: "error" });
    return undefined;
  }

  setBusy(true);
  setStatus(`Updating ${rows.length} booked call lead row(s)…`);

  try {
    const results = await syncBookedCallLeadReconciliation(rows);
    state.callLeads.bookedReconciliationRows =
      state.callLeads.bookedReconciliationRows.map((preview) => ({
        ...preview,
        result:
          results.find((result) => result.row_id === preview.payload.row_id) ??
          preview.result,
      }));

    const updated = results.filter(
      (result) => result.status === "updated",
    ).length;
    const unchanged = results.filter(
      (result) => result.status === "unchanged",
    ).length;
    const failed = results.filter(
      (result) =>
        result.status === "failed" ||
        result.status === "conflict" ||
        result.status === "booking_missing" ||
        result.status === "invalid",
    ).length;
    setStatus(
      `Booked call sync complete. Updated ${updated}, unchanged ${unchanged}, failed/missing ${failed}.`,
    );
    return { updated, unchanged, failed };
  } catch (err) {
    setStatus(
      `Booked call sync failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
    return undefined;
  } finally {
    setBusy(false);
    renderCallLeads();
  }
}

async function syncCurrentLead() {
  const refreshed = await loadCurrentLeadPreview({
    preserveOverride: true,
    quiet: true,
  });

  if (!refreshed) {
    setStatus("Could not re-scan the current lead. Reload the Granot page.", {
      tone: "error",
    });
    return;
  }

  const fe = state.formEditLead;
  if (!fe.preview) {
    setStatus("No current lead preview is available.", { tone: "error" });
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted();
  if (typeof targetQuoted !== "boolean") {
    fe.result = {
      status: "skipped",
      message:
        "Choose an override or use a parsed Level-0/Level-1 before syncing.",
    };
    renderFormEditLead();
    setStatus(fe.result.message, { tone: "error" });
    return;
  }

  setBusy(true);
  setStatus("Syncing current lead…");
  const candidate = {
    ...fe.preview.lead,
    quoted: targetQuoted,
    status: "syncable",
  } satisfies LeadSyncCandidate;

  const results = await syncLeadCandidates([candidate], (id, result) => {
    if (id === candidate.id) {
      fe.result = result;
      renderFormEditLead();
    }
  });

  setStatus(
    `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`,
  );
  setBusy(false);
  renderFormEditLead();
}

async function syncLeadCandidates(
  candidates: LeadSyncCandidate[],
  onResult: (id: string, result: RowSyncResult) => void,
): Promise<SyncCounts> {
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (typeof candidate.quoted !== "boolean") {
      onResult(candidate.id, {
        status: "skipped",
        message: "Missing quoted target",
      });
      continue;
    }

    try {
      const current = await getFormLeadById(candidate.refNo);
      const updatePayload = buildFormLeadUpdatePayload(candidate, current);
      const syncPayload =
        Object.keys(updatePayload).length > 0
          ? updatePayload
          : buildFormLeadSyncPayload(candidate);
      await updateFormLead(candidate.refNo, syncPayload);

      if (Object.keys(updatePayload).length === 0) {
        unchanged += 1;
        onResult(candidate.id, {
          status: "unchanged",
          message: `${buildUnchangedMessage(candidate)}; sync request sent anyway.`,
        });
      } else {
        updated += 1;
        onResult(candidate.id, {
          status: "updated",
          message: buildUpdatedMessage(updatePayload),
        });
      }
    } catch (err) {
      failed += 1;
      onResult(candidate.id, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { updated, unchanged, failed };
}

function buildFormLeadUpdatePayload(
  candidate: LeadSyncCandidate,
  current: { quoted?: boolean; cubic_feet?: number },
): FormLeadUpdatePayload {
  const payload: FormLeadUpdatePayload = {};
  if (current.quoted !== candidate.quoted) {
    payload.quoted = candidate.quoted;
  }
  if (
    typeof candidate.cubicFeet === "number" &&
    current.cubic_feet !== candidate.cubicFeet
  ) {
    payload.cubic_feet = candidate.cubicFeet;
  }
  return payload;
}

function buildFormLeadSyncPayload(
  candidate: LeadSyncCandidate,
): FormLeadUpdatePayload {
  const payload: FormLeadUpdatePayload = {};
  if (typeof candidate.quoted === "boolean") {
    payload.quoted = candidate.quoted;
  }
  if (typeof candidate.cubicFeet === "number") {
    payload.cubic_feet = candidate.cubicFeet;
  }
  return payload;
}

function buildUnchangedMessage(candidate: LeadSyncCandidate): string {
  const parts = [`Already quoted=${candidate.quoted}`];
  if (typeof candidate.cubicFeet === "number") {
    parts.push(`cubic_feet=${candidate.cubicFeet}`);
  }
  return parts.join(", ");
}

function buildUpdatedMessage(payload: FormLeadUpdatePayload): string {
  return Object.entries(payload)
    .map(([field, value]) => `Updated ${field}=${value}`)
    .join(", ");
}

/* ============================================================================
 * Auto ScanAndSync
 * ========================================================================== */

function startAutoScanAndSync(workflow: ListWorkspaceId) {
  const ws = workflow === "form-leads" ? state.formLeads : state.callLeads;
  if (ws.autoRunning) return;

  stopAutoScanAndSync(workflow);

  const ms = intervalMs(ws.intervalValue, ws.intervalUnit);
  ws.autoTimerId = window.setInterval(() => {
    void runAutoScanAndSync(workflow);
  }, ms);
  ws.autoRunning = true;
  ws.autoStartedAt = formatTime(new Date());

  renderFormLeads();
  renderCallLeads();
  void runAutoScanAndSync(workflow);
}

function stopAutoScanAndSync(workflow: ListWorkspaceId) {
  const ws = workflow === "form-leads" ? state.formLeads : state.callLeads;
  if (typeof ws.autoTimerId === "number") {
    window.clearInterval(ws.autoTimerId);
  }
  ws.autoTimerId = undefined;
  ws.autoRunning = false;
  ws.autoStartedAt = undefined;
  renderFormLeads();
  renderCallLeads();
}

async function runAutoScanAndSync(workflow: ListWorkspaceId) {
  const startedAt = formatTime(new Date());

  if (state.isBusy) {
    pushCycle(workflow, {
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
      const scanned = await scanFollowUpTable({ quiet: true });
      if (!scanned) {
        pushCycle(workflow, {
          status: "failed",
          message: "Scan failed — no Follow Up Estimates table reachable.",
          details: [],
          startedAt,
          finishedAt: formatTime(new Date()),
        });
        return;
      }

      const syncableRows = state.formLeads.parsedRows.filter(isSyncableRow);
      const unsyncableRows = state.formLeads.parsedRows.filter(
        (row) => !isSyncableRow(row),
      );
      const results = await syncRows(syncableRows);

      const details: CycleDetail[] = [
        ...syncableRows.map((row) =>
          followUpRowToCycleDetail(
            row,
            state.formLeads.syncResults.get(row.id),
          ),
        ),
        ...unsyncableRows.map((row) => followUpRowToCycleDetail(row)),
      ];

      pushCycle(workflow, {
        status: results && results.failed === 0 ? "ok" : "failed",
        message: buildCycleSummary("Form Leads", syncableRows.length, results),
        details,
        startedAt,
        finishedAt: formatTime(new Date()),
      });
      return;
    }

    // call-leads
    const scanned = await scanCallLeadsPreview({ quiet: true });
    if (!scanned) {
      pushCycle(workflow, {
        status: "failed",
        message:
          "Scan failed — no Call Leads / Booked Call Leads tables reachable.",
        details: [],
        startedAt,
        finishedAt: formatTime(new Date()),
      });
      return;
    }

    const syncableRows = state.callLeads.enrichmentRows.filter(
      canSyncCallEnrichmentRow,
    );
    const unsyncableRows = state.callLeads.enrichmentRows.filter(
      (row) => !canSyncCallEnrichmentRow(row),
    );
    const results = await syncCallRows(syncableRows.map((row) => row.payload));
    const latestEnrichmentRows = state.callLeads.enrichmentRows;

    const details: CycleDetail[] = [
      ...syncableRows.map((row) =>
        callEnrichmentRowToCycleDetail(
          latestEnrichmentRows.find(
            (preview) => preview.payload.row_id === row.payload.row_id,
          ) ?? row,
        ),
      ),
      ...unsyncableRows.map((row) => callEnrichmentRowToCycleDetail(row)),
    ];

    pushCycle(workflow, {
      status: results && results.failed === 0 ? "ok" : "failed",
      message: buildCycleSummary("Call Leads", syncableRows.length, results),
      details,
      startedAt,
      finishedAt: formatTime(new Date()),
    });
  } finally {
    renderFormLeads();
    renderCallLeads();
  }
}

function pushCycle(
  workflow: ListWorkspaceId,
  entry: Omit<CycleEntry, "id" | "workflow">,
) {
  const cycle: CycleEntry = {
    ...entry,
    id: `${workflow}:${Date.now()}:${Math.random()}`,
    workflow,
  };
  const ws = workflow === "form-leads" ? state.formLeads : state.callLeads;
  ws.cycles = [cycle, ...ws.cycles].slice(0, MAX_CYCLES);
  if (workflow === "form-leads") {
    renderFormLeadsHistory();
  } else {
    renderCallLeadsHistory();
  }
}

function buildCycleSummary(
  label: string,
  syncableCount: number,
  results?: SyncCounts,
): string {
  if (!results) {
    return `${label}: scanned, no supported rows were synced.`;
  }
  return `${label}: ${syncableCount} syncable · ${results.updated} updated · ${results.unchanged} unchanged · ${results.failed} failed.`;
}

function followUpRowToCycleDetail(
  row: FollowUpRow,
  result?: RowSyncResult,
): CycleDetail {
  const rowLabel = `#${row.displayNumber || row.rowIndex} ${
    row.customer || "Unknown customer"
  }`;
  const fragments = [
    `ref_no=${row.refNo || "missing"}`,
    `quoted=${typeof row.quoted === "boolean" ? row.quoted : "n/a"}`,
    `cubic_feet=${typeof row.cubicFeet === "number" ? row.cubicFeet : "n/a"}`,
  ];

  if (result) {
    return {
      rowId: row.id,
      rowLabel,
      status:
        result.status === "updated"
          ? "ok"
          : result.status === "unchanged"
            ? "unchanged"
            : result.status === "failed"
              ? "failed"
              : "skipped",
      message: [fragments.join(", "), result.message].join(" · "),
    };
  }

  return {
    rowId: row.id,
    rowLabel,
    status: "skipped",
    message: [fragments.join(", "), row.reason ?? row.status].join(" · "),
  };
}

function callEnrichmentRowToCycleDetail(
  row: CallLeadEnrichmentPreview,
): CycleDetail {
  const label = `#${row.payload.row_index ?? row.payload.row_id} ${
    row.payload.customer || "Unknown customer"
  }`;
  const result = row.result;
  const fragments = [
    row.payload.phone ? `phone=${row.payload.phone}` : undefined,
    row.payload.job_no ? `job_no=${row.payload.job_no}` : undefined,
    row.payload.est_cf ? `est_cf=${row.payload.est_cf}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  if (!result) {
    return {
      rowId: row.payload.row_id,
      rowLabel: label,
      status: "skipped",
      message: [fragments, "not syncable"].filter(Boolean).join(" · "),
    };
  }

  const status: CycleDetail["status"] =
    result.status === "updated"
      ? "ok"
      : result.status === "unchanged"
        ? "unchanged"
        : result.status === "failed" || result.status === "conflict"
          ? "failed"
          : "skipped";

  const messageParts = [
    fragments,
    result.message,
    result.changes.length ? `changes: ${result.changes.join(", ")}` : undefined,
  ].filter(Boolean);

  return {
    rowId: row.payload.row_id,
    rowLabel: label,
    status,
    message: messageParts.join(" · "),
  };
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function isSyncableRow(row: FollowUpRow): boolean {
  return row.status === "syncable" && typeof row.quoted === "boolean";
}

function rowToSyncCandidate(row: FollowUpRow): LeadSyncCandidate {
  return {
    id: row.id,
    refNo: row.refNo,
    quoted: row.quoted,
    cubicFeet: row.cubicFeet,
    status: row.status,
  };
}

function getCurrentLeadTargetQuoted(): boolean | undefined {
  const fe = state.formEditLead;
  if (!fe.preview) return undefined;
  if (fe.override === "quoted_false") return false;
  if (fe.override === "quoted_true") return true;
  return fe.preview.lead.quoted;
}

function canSyncCurrentLead(): boolean {
  const fe = state.formEditLead;
  if (!fe.preview || fe.preview.lead.status === "invalid_ref_no") {
    return false;
  }
  return typeof getCurrentLeadTargetQuoted() === "boolean";
}

function canSyncCallEnrichmentRow(row?: CallLeadEnrichmentPreview): boolean {
  return isSyncAllowedCallStatus(row?.result?.status);
}

function canSyncBookedCallReconciliationRow(
  row?: BookedCallLeadReconciliationPreview,
): boolean {
  return isSyncAllowedCallStatus(row?.result?.status);
}

function isSyncAllowedCallStatus(status?: string): boolean {
  return (
    status === "updateable" || status === "unchanged" || status === "updated"
  );
}

function callLeadRowsToEnrichmentPayloads(
  preview: CallLeadPreviewResponse,
): CallLeadEnrichmentRowPayload[] {
  const followUp = preview.sections.find(
    (section) => section.key === "followUpEstimates",
  );
  if (!followUp) {
    return [];
  }
  return followUp.rows.map((row) => ({
    row_id: row.id,
    row_index: row.rowIndex,
    job_no: getPreviewValue(row, "job_no"),
    customer: getPreviewValue(row, "customer"),
    phone: getPreviewValue(row, "phone"),
    email: getPreviewValue(row, "email"),
    from_zip: getPreviewValue(row, "from_zip"),
    to_zip: getPreviewValue(row, "to_zip"),
    est_cf: getPreviewValue(row, "est_cf"),
  }));
}

function callLeadRowsToBookedReconciliationPayloads(
  preview: CallLeadPreviewResponse,
): BookedCallLeadReconciliationRowPayload[] {
  const booked = preview.sections.find(
    (section) => section.key === "bookedJobs",
  );
  if (!booked) {
    return [];
  }
  return booked.rows.map((row) => ({
    row_id: row.id,
    row_index: row.rowIndex,
    section: "bookedJobs",
    job_no: getPreviewValue(row, "job_no"),
    source: getPreviewValue(row, "source"),
    prior: getPreviewValue(row, "prior"),
    book_date: getPreviewValue(row, "book_date"),
    customer: getPreviewValue(row, "customer"),
    phone: getPreviewValue(row, "phone"),
    email: getPreviewValue(row, "email"),
    from_zip: getPreviewValue(row, "from_zip"),
    to_zip: getPreviewValue(row, "to_zip"),
    est_cf: getPreviewValue(row, "est_cf"),
  }));
}

function getPreviewValue(
  row: CallLeadPreviewRow,
  key: string,
): string | undefined {
  const value = row.values[key];
  return value?.trim() || undefined;
}

/* ============================================================================
 * Movable window
 * ========================================================================== */

async function openDetached() {
  if (isDetachedWindow) {
    setStatus("This popup is already in a movable browser window.");
    return;
  }

  try {
    const tabId = await getTargetTabId();
    const popupUrl = browser.runtime.getURL(
      `/popup.html?detached=1&targetTabId=${encodeURIComponent(String(tabId))}`,
    );
    await browser.windows.create({
      url: popupUrl,
      type: "popup",
      width: 1040,
      height: 820,
    });
    setStatus("Opened a movable Granot Sync window tied to this tab.");
  } catch {
    setStatus(
      "Could not open a movable window. Make sure a Granot tab is active.",
      { tone: "error" },
    );
  }
}

/* ============================================================================
 * Connection chip
 * ========================================================================== */

async function refreshConnectionChip() {
  try {
    const tabId = await getTargetTabId();
    dom.connChip.classList.remove("is-bad");
    dom.connChip.classList.add("is-ok");
    dom.connChipText.textContent = `Connected · tab #${tabId}`;
  } catch {
    dom.connChip.classList.remove("is-ok");
    dom.connChip.classList.add("is-bad");
    dom.connChipText.textContent = "no Granot tab found";
  }
}

/* ============================================================================
 * Debug + Diagnostics
 * ========================================================================== */

async function runDebugDumpTables() {
  setStatus("Dumping raw tables to console…");
  dom.debugResult.textContent = "";
  setBusy(true);
  try {
    const response = await sendActiveTabMessage<{
      tables?: unknown[];
      frameResponses?: number;
      frameCount?: number;
    }>({ type: "DUMP_TABLES" });

    const count = response?.tables?.length ?? 0;
    const frameResponses = response?.frameResponses ?? 0;
    const frameCount = response?.frameCount ?? 0;

    if (frameResponses === 0) {
      const message =
        "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.";
      dom.debugResult.textContent = message;
      setStatus(message, { tone: "error" });
      return;
    }

    const message = `Logged ${count} table(s) across ${frameResponses}/${frameCount} frame(s) — see Console on the Granot tab (filter for "[Granot Sync]").`;
    dom.debugResult.textContent = message;
    setStatus(message);
  } catch {
    const message =
      "Could not reach content script. Reload the Granot page and try again.";
    dom.debugResult.textContent = message;
    setStatus(message, { tone: "error" });
  } finally {
    setBusy(false);
  }
}

async function runAndRenderDiagnostics() {
  setStatus("Running diagnostics…");
  dom.diagnoseOutput.textContent = "";
  setBusy(true);

  try {
    const report = await runDiagnostics();
    renderDiagnostics(report);
    setStatus(summariseDiagnostics(report));
  } catch (err) {
    setStatus(
      `Diagnostics crashed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
  } finally {
    setBusy(false);
  }
}

async function runDiagnostics(): Promise<DiagnosticsReport> {
  const errors: string[] = [];
  const manifest = browser.runtime.getManifest();
  const matchPatterns = [...GRANOT_URL_PATTERNS];

  let popupWindowId: number | undefined;
  try {
    const popupWindow = await browser.windows.getCurrent();
    popupWindowId = popupWindow.id ?? undefined;
  } catch (err) {
    errors.push(
      `windows.getCurrent failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let activeTabId: number | undefined;
  let activeTabUrl: string | undefined;
  let activeTabTitle: string | undefined;
  let activeWindowId: number | undefined;

  try {
    if (typeof targetTabId === "number") {
      const tab = await browser.tabs.get(targetTabId);
      activeTabId = tab.id;
      activeTabUrl = tab.url;
      activeTabTitle = tab.title;
      activeWindowId = tab.windowId;
    } else {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      activeTabId = tab?.id;
      activeTabUrl = tab?.url;
      activeTabTitle = tab?.title;
      activeWindowId = tab?.windowId;
    }
  } catch (err) {
    errors.push(
      `tabs.query/get failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const matchingPattern = activeTabUrl
    ? matchPatterns.find((pattern) =>
        matchPatternMatches(pattern, activeTabUrl!),
      )
    : undefined;

  type FrameDetails = {
    frameId: number;
    parentFrameId?: number;
    url?: string;
  };

  let frames: FrameDetails[] | undefined;
  if (typeof activeTabId === "number") {
    try {
      const result = (await browser.webNavigation.getAllFrames({
        tabId: activeTabId,
      })) as FrameDetails[] | null | undefined;
      frames = result ?? undefined;
    } catch (err) {
      errors.push(
        `webNavigation.getAllFrames failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const frameSummaries: FrameDiagnostic[] = [];
  if (typeof activeTabId === "number") {
    const targets =
      frames && frames.length > 0
        ? frames.map((frame) => ({
            frameId: frame.frameId,
            parentFrameId: frame.parentFrameId,
            frameUrl: frame.url,
          }))
        : [{ frameId: 0, parentFrameId: undefined, frameUrl: activeTabUrl }];

    await Promise.all(
      targets.map(async (target) => {
        const summary: FrameDiagnostic = {
          frameId: target.frameId,
          parentFrameId: target.parentFrameId,
          frameUrl: target.frameUrl,
        };

        try {
          const response = await pingFrameWithTimeout(
            activeTabId!,
            target.frameId,
            1500,
          );
          summary.pingResponse = response;
        } catch (err) {
          summary.pingError = err instanceof Error ? err.message : String(err);
        }

        frameSummaries.push(summary);
      }),
    );

    frameSummaries.sort((a, b) => a.frameId - b.frameId);
  }

  const matches = Boolean(matchingPattern);
  return {
    popupUrl: window.location.href,
    popupWindowId,
    isDetached: isDetachedWindow,
    targetTabId,
    activeTabId,
    activeTabUrl,
    activeTabTitle,
    activeWindowId,
    matchPatterns,
    matches,
    matchingPattern,
    manifestVersion: manifest.version,
    manifestName: manifest.name,
    manifestRuntimeId: browser.runtime.id,
    browser: detectBrowserKind(),
    manifestVersionNumber: manifest.manifest_version,
    frames: frameSummaries,
    errors,
  };
}

async function pingFrameWithTimeout(
  tabId: number,
  frameId: number,
  timeoutMs: number,
): Promise<FramePingResponse | undefined> {
  return new Promise<FramePingResponse | undefined>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`timeout after ${timeoutMs}ms (no response)`));
    }, timeoutMs);

    browser.tabs
      .sendMessage(tabId, { type: "PING" }, { frameId })
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve((response as FramePingResponse | undefined) ?? undefined);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

function summariseDiagnostics(report: DiagnosticsReport): string {
  const responding = report.frames.filter((frame) => frame.pingResponse).length;
  const total = report.frames.length;

  if (!report.activeTabId) {
    return "No active tab found. Click the extension on the Granot tab, not on an extension page.";
  }
  if (!report.matches) {
    return `Active tab URL is NOT covered by content_scripts.matches. URL: ${report.activeTabUrl}`;
  }
  if (total === 0) {
    return "No frames returned by webNavigation. Reload the Granot tab.";
  }
  if (responding === 0) {
    return `0/${total} frames responded to PING. Content script never injected. Reload the tab and the add-on.`;
  }
  return `${responding}/${total} frames responded. See report below.`;
}

function renderDiagnostics(report: DiagnosticsReport): void {
  dom.diagnoseOutput.textContent = "";

  const heading = document.createElement("p");
  heading.className = "status-text";
  heading.style.margin = "0 0 10px";
  heading.textContent = `${report.manifestName} v${report.manifestVersion} (${report.browser}, MV${report.manifestVersionNumber}) — runtime id ${report.manifestRuntimeId}`;
  dom.diagnoseOutput.append(heading);

  const container = document.createElement("div");
  container.className = "diag";

  const lines: Array<{ key: string; value: string; tone?: "good" | "bad" }> = [
    {
      key: "Popup URL",
      value: `${report.popupUrl} (window ${report.popupWindowId ?? "?"}${report.isDetached ? ", detached" : ""})`,
    },
    {
      key: "Target tab",
      value: `id=${report.activeTabId ?? "?"} window=${
        report.activeWindowId ?? "?"
      }${
        typeof report.targetTabId === "number"
          ? ` (pinned via targetTabId=${report.targetTabId})`
          : ""
      }`,
      tone: report.activeTabId == null ? "bad" : "good",
    },
    {
      key: "Tab URL",
      value: report.activeTabUrl ?? "(unknown)",
    },
    {
      key: "Tab title",
      value: report.activeTabTitle ?? "(unknown)",
    },
    {
      key: "URL matches content_scripts",
      value: report.matches
        ? `YES — pattern '${report.matchingPattern}'`
        : `NO — none of [${report.matchPatterns.join(", ")}] match this URL`,
      tone: report.matches ? "good" : "bad",
    },
    {
      key: "Frames",
      value: `${report.frames.length} reported by webNavigation`,
    },
  ];

  for (const line of lines) {
    container.append(buildDiagLine(line.key, line.value, line.tone));
  }
  for (const frame of report.frames) {
    container.append(buildFrameDiagBlock(frame));
  }
  if (report.errors.length > 0) {
    container.append(buildDiagLine("Errors", report.errors.join(" | "), "bad"));
  }
  container.append(
    buildDiagLine(
      "Hint",
      "If a frame says NOT RESPONDING but its URL matches one of the patterns, the content script never injected — usually because (a) you have the dev folder loaded but `pnpm dev` is not running, (b) the add-on was loaded before the manifest was rebuilt and needs Reload, or (c) Firefox has a stale duplicate of granot-sync@vantage.dev installed.",
    ),
  );

  dom.diagnoseOutput.append(container);
}

function buildDiagLine(
  key: string,
  value: string,
  tone?: "good" | "bad",
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "diag-row";
  const k = document.createElement("span");
  k.className = "diag-key";
  k.textContent = `${key}: `;
  const v = document.createElement("span");
  if (tone === "good") {
    v.className = "diag-good";
  } else if (tone === "bad") {
    v.className = "diag-bad";
  }
  v.textContent = value;
  wrapper.append(k, v);
  return wrapper;
}

function buildFrameDiagBlock(frame: FrameDiagnostic): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "diag-row";
  const responded = Boolean(frame.pingResponse);

  const header = document.createElement("div");
  const headerKey = document.createElement("span");
  headerKey.className = "diag-key";
  headerKey.textContent = `Frame ${frame.frameId}${
    typeof frame.parentFrameId === "number" && frame.parentFrameId !== -1
      ? ` (parent ${frame.parentFrameId})`
      : " (top)"
  }: `;
  const headerVal = document.createElement("span");
  headerVal.className = responded ? "diag-good" : "diag-bad";
  headerVal.textContent = responded
    ? `RESPONDING — content script v${frame.pingResponse?.extensionVersion}`
    : `NOT RESPONDING${frame.pingError ? ` (${frame.pingError})` : ""}`;
  header.append(headerKey, headerVal);
  wrapper.append(header);

  const url = document.createElement("div");
  const urlKey = document.createElement("span");
  urlKey.className = "diag-key";
  urlKey.textContent = "  url: ";
  const urlVal = document.createElement("span");
  urlVal.textContent = frame.frameUrl ?? "(unknown)";
  url.append(urlKey, urlVal);
  wrapper.append(url);

  if (frame.pingResponse) {
    const r = frame.pingResponse;
    const detail = document.createElement("div");
    detail.className = "diag-key";
    detail.textContent = `  ready=${r.documentReadyState} title="${r.documentTitle ?? ""}" htmlLen=${r.htmlLength ?? 0} tables=${r.tableCount ?? 0} followUpHeading=${r.hasFollowUpHeading ? "yes" : "no"} bookedJobsHeading=${r.hasBookedJobsHeading ? "yes" : "no"} startedAt=${r.startedAt}`;
    wrapper.append(detail);
  }

  return wrapper;
}

/* ============================================================================
 * Page communication (unchanged from original)
 * ========================================================================== */

async function sendActiveTabMessage<T>(message: unknown): Promise<T> {
  const tabId = await getTargetTabId();

  if (isFrameAggregatedMessage(message)) {
    const frames = await getTabFrames(tabId);
    const responses = await Promise.all(
      frames.map((frame) =>
        browser.tabs
          .sendMessage(tabId, message, { frameId: frame.frameId })
          .catch(() => undefined),
      ),
    );

    return aggregateFrameResponses<T>(message, responses);
  }

  return browser.tabs.sendMessage(tabId, message) as Promise<T>;
}

function isFrameAggregatedMessage(
  message: unknown,
): message is { type: string } {
  return (
    isRecord(message) &&
    (message.type === "DUMP_TABLES" ||
      message.type === "PARSE_FOLLOW_UP_ROWS" ||
      message.type === "PARSE_CURRENT_FORM_LEAD" ||
      message.type === "PARSE_CALL_LEAD_TABLES")
  );
}

async function getTabFrames(
  tabId: number,
): Promise<Array<{ frameId: number }>> {
  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const frameIds = frames
      ?.map((frame) => frame.frameId)
      .filter((frameId): frameId is number => typeof frameId === "number");
    return frameIds?.length
      ? frameIds.map((frameId) => ({ frameId }))
      : [{ frameId: 0 }];
  } catch {
    return [{ frameId: 0 }];
  }
}

function aggregateFrameResponses<T>(
  message: { type: string },
  responses: unknown[],
): T {
  const validResponses = responses.filter(isRecord);

  if (message.type === "DUMP_TABLES") {
    return {
      ok: true,
      tables: validResponses.flatMap((response) =>
        Array.isArray(response.tables) ? response.tables : [],
      ),
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_FOLLOW_UP_ROWS") {
    const foundResponse = validResponses.find(
      (response) => response.tableFound === true,
    );
    const aggregated = foundResponse ?? {
      ok: true,
      tableFound: false,
      rows: [],
      counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
    };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_CURRENT_FORM_LEAD") {
    const foundResponse = validResponses.find(
      (response) => response.pageFound === true,
    );
    const aggregated = foundResponse ?? { ok: true, pageFound: false };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_CALL_LEAD_TABLES") {
    const foundResponse = validResponses.find(
      (response) => response.pageFound === true,
    );
    const aggregated = foundResponse ?? {
      ok: true,
      pageFound: false,
      sections: [],
    };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  return validResponses[0] as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getTargetTabId(): Promise<number> {
  if (typeof targetTabId === "number") {
    return targetTabId;
  }
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }
  return tab.id;
}

function matchPatternMatches(pattern: string, url: string): boolean {
  if (pattern === "<all_urls>") return true;

  const groups = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!groups) return false;
  const [, protocolPart, hostPart, pathPart] = groups;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.replace(":", "");
  if (protocolPart !== "*") {
    if (protocolPart !== protocol) return false;
  } else if (protocol !== "http" && protocol !== "https") {
    return false;
  }

  const hostnameRegexes = [
    convertWildcardToRegex(hostPart),
    convertWildcardToRegex(hostPart.replace(/^\*\./, "")),
  ];
  if (!hostnameRegexes.some((rx) => rx.test(parsed.hostname))) {
    return false;
  }

  const pathRegex = convertWildcardToRegex(pathPart);
  return pathRegex.test(parsed.pathname);
}

function convertWildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function detectBrowserKind(): "firefox" | "chrome" | "unknown" {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Chrome\//i.test(ua) || /Edg\//i.test(ua)) return "chrome";
  return "unknown";
}
