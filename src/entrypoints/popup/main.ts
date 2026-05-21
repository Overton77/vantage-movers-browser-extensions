import { GRANOT_URL_PATTERNS } from "../../config";
import {
  getFormLeadById,
  previewCallLeadEnrichment,
  syncCallLeadEnrichment,
  updateFormLeadQuoted,
  type CallLeadEnrichmentResult,
  type CallLeadEnrichmentRowPayload,
} from "../../utils/api";

type FollowUpRow = {
  id: string;
  rowIndex: number;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  status: "syncable" | "invalid_ref_no" | "unsupported_prior" | "missing_prior";
  reason?: string;
};

type LeadStatus = FollowUpRow["status"];

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

type LeadSyncCandidate = {
  id: string;
  refNo: string;
  quoted?: boolean;
  status: LeadStatus;
};

type CurrentLeadPreview = {
  lead: CurrentFormLead;
  currentQuoted?: boolean;
  error?: string;
};

type RowSyncResult = {
  status: "updated" | "unchanged" | "failed" | "skipped";
  message: string;
};

type ActiveMode = "empty" | "follow-up" | "current-lead" | "call-leads" | "diagnostics";
type OverrideMode = "parsed" | "quoted_false" | "quoted_true";

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

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const summaryEl = document.querySelector<HTMLDivElement>("#summary")!;
const rowsEl = document.querySelector<HTMLDivElement>("#rows")!;
const dumpBtn = document.querySelector<HTMLButtonElement>("#dump-tables")!;
const diagnoseBtn =
  document.querySelector<HTMLButtonElement>("#diagnose-page")!;
const openDetachedBtn =
  document.querySelector<HTMLButtonElement>("#open-detached")!;
const followUpPanel = document.querySelector<HTMLElement>("#follow-up-panel")!;
const currentLeadPanel = document.querySelector<HTMLElement>(
  "#current-lead-panel",
)!;
const callLeadsPanel = document.querySelector<HTMLElement>("#call-leads-panel")!;
const scanCurrentPageBtn =
  document.querySelector<HTMLButtonElement>("#scan-current-page")!;
const syncCurrentLeadBtn =
  document.querySelector<HTMLButtonElement>("#sync-current-lead")!;
const scanFollowUpBtn =
  document.querySelector<HTMLButtonElement>("#scan-follow-up")!;
const scanCallLeadsBtn =
  document.querySelector<HTMLButtonElement>("#scan-call-leads")!;
const syncCallSelectedBtn =
  document.querySelector<HTMLButtonElement>("#sync-call-selected")!;
const syncCallAllBtn = document.querySelector<HTMLButtonElement>("#sync-call-all")!;
const selectAllCallBtn =
  document.querySelector<HTMLButtonElement>("#select-all-call")!;
const deselectAllCallBtn =
  document.querySelector<HTMLButtonElement>("#deselect-all-call")!;
const syncSelectedBtn =
  document.querySelector<HTMLButtonElement>("#sync-selected")!;
const syncAllBtn = document.querySelector<HTMLButtonElement>("#sync-all")!;
const selectAllBtn = document.querySelector<HTMLButtonElement>("#select-all")!;
const deselectAllBtn =
  document.querySelector<HTMLButtonElement>("#deselect-all")!;
const popupParams = new URLSearchParams(window.location.search);
const targetTabIdRaw = popupParams.get("targetTabId");
// Number(null) === 0, so we must check the raw string is present AND parses
// to a positive integer. WebExtensions tab ids are always >= 1, and tab id 0
// is invalid in both Firefox and Chrome.
const targetTabIdParsed =
  targetTabIdRaw != null && targetTabIdRaw !== ""
    ? Number(targetTabIdRaw)
    : NaN;
const targetTabId =
  Number.isInteger(targetTabIdParsed) && targetTabIdParsed > 0
    ? targetTabIdParsed
    : undefined;
const isDetachedWindow = popupParams.get("detached") === "1";

let activeMode: ActiveMode = "empty";
let parsedRows: FollowUpRow[] = [];
let selectedRowIds = new Set<string>();
let currentLeadPreview: CurrentLeadPreview | undefined;
let callLeadPreview: CallLeadPreviewResponse | undefined;
let callLeadEnrichmentRows: CallLeadEnrichmentPreview[] = [];
let selectedCallRowIds = new Set<string>();
let currentLeadOverride: OverrideMode = "parsed";
let currentLeadResult: RowSyncResult | undefined;
let syncResults = new Map<string, RowSyncResult>();
let isBusy = false;

if (isDetachedWindow) {
  openDetachedBtn.textContent = "Movable Window Active";
}

dumpBtn.addEventListener("click", async () => {
  statusEl.textContent = "Scanning…";

  try {
    const response = await sendActiveTabMessage<{
      tables?: unknown[];
      frameResponses?: number;
      frameCount?: number;
    }>({
      type: "DUMP_TABLES",
    });

    const count = response?.tables?.length ?? 0;
    const frameResponses = response?.frameResponses ?? 0;
    const frameCount = response?.frameCount ?? 0;

    if (frameResponses === 0) {
      statusEl.textContent =
        "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.";
      return;
    }

    statusEl.textContent = `Logged ${count} table(s) across ${frameResponses}/${frameCount} frame(s) — see Console on the Granot tab.`;
  } catch {
    statusEl.textContent =
      "Could not reach content script. Reload the Granot page and try again.";
  }
});

diagnoseBtn.addEventListener("click", async () => {
  statusEl.textContent = "Running diagnostics…";
  activeMode = "diagnostics";
  parsedRows = [];
  selectedRowIds = new Set();
  currentLeadPreview = undefined;
  callLeadPreview = undefined;
  callLeadEnrichmentRows = [];
  selectedCallRowIds = new Set();
  currentLeadResult = undefined;
  syncResults = new Map();
  setBusy(true);

  try {
    const report = await runDiagnostics();
    renderDiagnostics(report);
    statusEl.textContent = summariseDiagnostics(report);
  } catch (err) {
    rowsEl.textContent = "";
    summaryEl.hidden = true;
    statusEl.textContent = `Diagnostics crashed: ${
      err instanceof Error ? err.message : String(err)
    }`;
  } finally {
    setBusy(false);
  }
});

openDetachedBtn.addEventListener("click", async () => {
  if (isDetachedWindow) {
    statusEl.textContent = "This popup is already in a movable browser window.";
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
      width: 860,
      height: 760,
    });
    statusEl.textContent =
      "Opened a movable Granot Sync window tied to this tab.";
  } catch {
    statusEl.textContent =
      "Could not open a movable window. Make sure a Granot tab is active.";
  }
});

scanCurrentPageBtn.addEventListener("click", async () => {
  await loadCurrentLeadPreview({ preserveOverride: false });
});

scanCallLeadsBtn.addEventListener("click", async () => {
  statusEl.textContent = "Scanning Call Leads / Booked Call Leads view…";
  activeMode = "call-leads";
  parsedRows = [];
  selectedRowIds = new Set();
  callLeadEnrichmentRows = [];
  selectedCallRowIds = new Set();
  currentLeadPreview = undefined;
  currentLeadResult = undefined;
  syncResults = new Map();
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<CallLeadPreviewResponse>({
      type: "PARSE_CALL_LEAD_TABLES",
    });

    callLeadPreview = response;
    const enrichmentPayloads = callLeadRowsToEnrichmentPayloads(response);
    callLeadEnrichmentRows = enrichmentPayloads.map((payload) => ({ payload }));
    if (enrichmentPayloads.length > 0) {
      const previewResults = await previewCallLeadEnrichment(enrichmentPayloads);
      callLeadEnrichmentRows = enrichmentPayloads.map((payload) => ({
        payload,
        result: previewResults.find((result) => result.row_id === payload.row_id),
      }));
      selectedCallRowIds = new Set(
        callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).map((row) => row.payload.row_id),
      );
    }
    render();

    if (!response?.pageFound) {
      if ((response?.frameResponses ?? 0) === 0) {
        statusEl.textContent =
          "Content script did not respond in any frame. Reload the Granot tab and the add-on.";
      } else {
        statusEl.textContent =
          "No Booked Jobs or Follow Up Estimates tables found on this tab.";
      }
      return;
    }

    const totalRows = response.sections.reduce(
      (total, section) => total + section.rows.length,
      0,
    );
    const updateable = callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).length;
    statusEl.textContent = `Preview ready: found ${totalRows} call lead row(s), ${updateable} updateable Follow Up row(s).`;
  } catch (err) {
    callLeadPreview = undefined;
    callLeadEnrichmentRows = [];
    selectedCallRowIds = new Set();
    render();
    statusEl.textContent = `Could not scan the Call Leads view: ${
      err instanceof Error ? err.message : String(err)
    }`;
  } finally {
    setBusy(false);
  }
});

selectAllCallBtn.addEventListener("click", () => {
  selectedCallRowIds = new Set(
    callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).map((row) => row.payload.row_id),
  );
  render();
});

deselectAllCallBtn.addEventListener("click", () => {
  selectedCallRowIds = new Set();
  render();
});

syncCallSelectedBtn.addEventListener("click", async () => {
  await syncCallRows(
    callLeadEnrichmentRows
      .filter((row) => selectedCallRowIds.has(row.payload.row_id))
      .map((row) => row.payload),
  );
});

syncCallAllBtn.addEventListener("click", async () => {
  await syncCallRows(
    callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).map((row) => row.payload),
  );
});

scanFollowUpBtn.addEventListener("click", async () => {
  statusEl.textContent = "Scanning Follow Up Estimates…";
  activeMode = "follow-up";
  currentLeadPreview = undefined;
  callLeadPreview = undefined;
  callLeadEnrichmentRows = [];
  selectedCallRowIds = new Set();
  currentLeadResult = undefined;
  syncResults = new Map();

  try {
    const response = await sendActiveTabMessage<ParseResponse>({
      type: "PARSE_FOLLOW_UP_ROWS",
    });

    if (!response?.tableFound) {
      parsedRows = [];
      selectedRowIds = new Set();
      render();

      if ((response?.frameResponses ?? 0) === 0) {
        statusEl.textContent =
          "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.";
      } else {
        statusEl.textContent =
          "No Follow Up Estimates table found on this tab.";
      }
      return;
    }

    parsedRows = response.rows;
    selectedRowIds = new Set(
      response.rows.filter(isSyncableRow).map((row) => row.id),
    );
    render();
    statusEl.textContent = `Found ${response.counts.total} row(s), ${response.counts.syncable} syncable.`;
  } catch {
    statusEl.textContent =
      "Could not scan. Reload the Granot page and confirm this tab is a matching CRM page.";
  }
});

selectAllBtn.addEventListener("click", () => {
  selectedRowIds = new Set(
    parsedRows.filter(isSyncableRow).map((row) => row.id),
  );
  render();
});

deselectAllBtn.addEventListener("click", () => {
  selectedRowIds = new Set();
  render();
});

syncSelectedBtn.addEventListener("click", async () => {
  await syncRows(parsedRows.filter((row) => selectedRowIds.has(row.id)));
});

syncAllBtn.addEventListener("click", async () => {
  await syncRows(parsedRows.filter(isSyncableRow));
});

syncCurrentLeadBtn.addEventListener("click", async () => {
  await syncCurrentLead();
});

void loadCurrentLeadPreview({ preserveOverride: false, quiet: true });

async function loadCurrentLeadPreview(options: {
  preserveOverride: boolean;
  quiet?: boolean;
}): Promise<boolean> {
  if (!options.quiet) {
    statusEl.textContent = "Scanning current Granot page…";
  }
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<CurrentFormLeadParseResponse>({
      type: "PARSE_CURRENT_FORM_LEAD",
    });

    activeMode = "current-lead";
    parsedRows = [];
    selectedRowIds = new Set();
    callLeadPreview = undefined;
    callLeadEnrichmentRows = [];
    selectedCallRowIds = new Set();
    syncResults = new Map();
    currentLeadResult = undefined;

    if (!options.preserveOverride) {
      currentLeadOverride = "parsed";
    }

    if (!response?.pageFound || !response.lead) {
      activeMode = "empty";
      currentLeadPreview = undefined;
      render();
      if (!options.quiet) {
        statusEl.textContent = "No CRM form edit lead found on this tab.";
      }
      return false;
    }

    currentLeadPreview = { lead: response.lead };

    if (response.lead.status !== "invalid_ref_no") {
      try {
        const current = await getFormLeadById(response.lead.refNo);
        currentLeadPreview = {
          lead: response.lead,
          currentQuoted: current.quoted,
        };
      } catch (err) {
        currentLeadPreview = {
          lead: response.lead,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    render();
    if (!options.quiet) {
      statusEl.textContent =
        response.lead.reason ?? "Current lead preview ready.";
    } else if (response.lead.status === "syncable") {
      statusEl.textContent =
        "Current lead detected. Review the preview before syncing.";
    }
    return true;
  } catch {
    activeMode = "empty";
    currentLeadPreview = undefined;
    currentLeadResult = undefined;
    render();
    if (!options.quiet) {
      statusEl.textContent =
        "Could not scan current page. Reload the Granot page and try again.";
    }
    return false;
  } finally {
    setBusy(false);
  }
}

async function syncCurrentLead() {
  const refreshed = await loadCurrentLeadPreview({
    preserveOverride: true,
    quiet: true,
  });

  if (!refreshed) {
    statusEl.textContent =
      "Could not re-scan the current lead. Reload the Granot page and try again.";
    return;
  }

  if (!currentLeadPreview) {
    statusEl.textContent = "No current lead preview is available.";
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted();
  if (typeof targetQuoted !== "boolean") {
    currentLeadResult = {
      status: "skipped",
      message:
        "Choose an override or use a parsed Level-0/Level-1 before syncing.",
    };
    render();
    statusEl.textContent = currentLeadResult.message;
    return;
  }

  setBusy(true);
  statusEl.textContent = "Syncing current lead…";
  const candidate = {
    ...currentLeadPreview.lead,
    quoted: targetQuoted,
    status: "syncable",
  } satisfies LeadSyncCandidate;

  const results = await syncLeadCandidates([candidate], (id, result) => {
    if (id === candidate.id) {
      currentLeadResult = result;
      render();
    }
  });

  statusEl.textContent = `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`;
  setBusy(false);
  render();
}

async function syncRows(rows: FollowUpRow[]) {
  const syncableRows = rows.filter(isSyncableRow).map(rowToSyncCandidate);
  if (syncableRows.length === 0) {
    statusEl.textContent = "No supported rows selected for sync.";
    return;
  }

  setBusy(true);
  statusEl.textContent = `Syncing ${syncableRows.length} row(s)…`;

  const results = await syncLeadCandidates(syncableRows, (id, result) => {
    syncResults.set(id, result);
    render();
  });

  statusEl.textContent = `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`;
  setBusy(false);
  render();
}

async function syncCallRows(rows: CallLeadEnrichmentRowPayload[]) {
  if (rows.length === 0) {
    statusEl.textContent = "No supported call lead rows selected for sync.";
    return;
  }

  setBusy(true);
  statusEl.textContent = `Syncing ${rows.length} call lead row(s)…`;

  try {
    const results = await syncCallLeadEnrichment(rows);
    callLeadEnrichmentRows = callLeadEnrichmentRows.map((preview) => ({
      ...preview,
      result:
        results.find((result) => result.row_id === preview.payload.row_id) ??
        preview.result,
    }));
    selectedCallRowIds = new Set(
      callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).map((row) => row.payload.row_id),
    );
    const updated = results.filter((result) => result.status === "updated").length;
    const unchanged = results.filter((result) => result.status === "unchanged").length;
    const failed = results.filter(
      (result) => result.status === "failed" || result.status === "conflict",
    ).length;
    statusEl.textContent = `Call sync complete. Updated ${updated}, unchanged ${unchanged}, failed/conflict ${failed}.`;
  } catch (err) {
    statusEl.textContent = `Call sync failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
  } finally {
    setBusy(false);
    render();
  }
}

async function syncLeadCandidates(
  candidates: LeadSyncCandidate[],
  onResult: (id: string, result: RowSyncResult) => void,
): Promise<{ updated: number; unchanged: number; failed: number }> {
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
      if (current.quoted === candidate.quoted) {
        unchanged += 1;
        onResult(candidate.id, {
          status: "unchanged",
          message: `Already quoted=${candidate.quoted}`,
        });
      } else {
        await updateFormLeadQuoted(candidate.refNo, candidate.quoted);
        updated += 1;
        onResult(candidate.id, {
          status: "updated",
          message: `Updated quoted=${candidate.quoted}`,
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
    const aggregated = foundResponse ?? { ok: true, pageFound: false, sections: [] };
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

function render() {
  renderSummary();
  if (activeMode === "current-lead") {
    renderCurrentLead();
  } else if (activeMode === "call-leads") {
    renderCallLeadPreview();
  } else {
    renderRows();
  }
  updateControls();
  updateActivePanels();
}

function updateActivePanels() {
  followUpPanel.classList.toggle("active", activeMode === "follow-up");
  currentLeadPanel.classList.toggle("active", activeMode === "current-lead");
  callLeadsPanel.classList.toggle("active", activeMode === "call-leads");
}

function renderSummary() {
  if (activeMode === "current-lead") {
    renderCurrentLeadSummary();
    return;
  }

  if (activeMode === "call-leads") {
    renderCallLeadSummary();
    return;
  }

  if (parsedRows.length === 0) {
    summaryEl.hidden = true;
    summaryEl.textContent = "";
    return;
  }

  const syncable = parsedRows.filter(isSyncableRow).length;
  const unsupported = parsedRows.filter(
    (row) => row.status === "unsupported_prior",
  ).length;
  const invalid = parsedRows.filter(
    (row) => row.status === "invalid_ref_no" || row.status === "missing_prior",
  ).length;
  const selected = parsedRows.filter((row) =>
    selectedRowIds.has(row.id),
  ).length;

  summaryEl.hidden = false;
  summaryEl.textContent = `${parsedRows.length} parsed row(s): ${syncable} syncable, ${unsupported} unsupported prior, ${invalid} invalid. ${selected} selected.`;
}

function renderCurrentLeadSummary() {
  if (!currentLeadPreview) {
    summaryEl.hidden = true;
    summaryEl.textContent = "";
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted();
  const currentQuoted = currentLeadPreview.currentQuoted;
  const action =
    typeof targetQuoted !== "boolean"
      ? "Preview only: choose an override or use a parsed Level-0/Level-1 before syncing."
      : typeof currentQuoted !== "boolean"
        ? "Preview loaded, but Vantage preflight did not return current quoted status."
        : currentQuoted === targetQuoted
          ? `Preview: Vantage already has quoted=${targetQuoted}. Sync will be unchanged.`
          : `Will update quoted from ${currentQuoted} to ${targetQuoted}.`;

  summaryEl.hidden = false;
  summaryEl.textContent = action;
}

function renderCallLeadSummary() {
  if (!callLeadPreview?.pageFound) {
    summaryEl.hidden = true;
    summaryEl.textContent = "";
    return;
  }

  const foundSections = callLeadPreview.sections.filter(
    (section) => section.tableFound,
  );
  const totalRows = foundSections.reduce(
    (total, section) => total + section.rows.length,
    0,
  );
  const updateable = callLeadEnrichmentRows.filter(canSyncCallEnrichmentRow).length;
  const selected = callLeadEnrichmentRows.filter((row) =>
    selectedCallRowIds.has(row.payload.row_id),
  ).length;

  summaryEl.hidden = false;
  summaryEl.textContent = `${foundSections.length} table(s) found. Showing ${totalRows} row(s). ${updateable} updateable Follow Up row(s), ${selected} selected.`;
}

function renderCurrentLead() {
  rowsEl.textContent = "";

  if (!currentLeadPreview) {
    return;
  }

  const { lead } = currentLeadPreview;
  const targetQuoted = getCurrentLeadTargetQuoted();
  const rowEl = document.createElement("div");
  rowEl.className = `row ${canSyncCurrentLead() ? "" : "unsyncable"}`;

  const headerEl = document.createElement("div");
  headerEl.className = "row-header";

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  titleEl.textContent = "Current Lead";
  headerEl.append(titleEl, statusBadge(lead));

  if (currentLeadOverride !== "parsed") {
    const overrideBadge = document.createElement("span");
    overrideBadge.className = "badge warn";
    overrideBadge.textContent = "override";
    headerEl.append(overrideBadge);
  }

  if (currentLeadResult) {
    headerEl.append(resultBadge(currentLeadResult));
  }

  rowEl.append(headerEl);

  const metaEl = document.createElement("div");
  metaEl.className = "row-meta";
  metaEl.textContent = [
    lead.reason,
    currentLeadPreview.error,
    currentLeadResult?.message,
  ]
    .filter(Boolean)
    .join(" | ");
  rowEl.append(metaEl);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  fieldGrid.append(
    fieldBlock("Form ref_no / Mongo id", lead.refNo || "missing"),
    fieldBlock(
      "Parsed Granot priority",
      lead.prior ? `Level-${lead.prior}` : "missing",
    ),
    fieldBlock(
      "Current Vantage quoted",
      typeof currentLeadPreview.currentQuoted === "boolean"
        ? String(currentLeadPreview.currentQuoted)
        : "unknown",
    ),
    fieldBlock(
      "Target Vantage quoted",
      typeof targetQuoted === "boolean" ? String(targetQuoted) : "not selected",
    ),
  );
  rowEl.append(fieldGrid);

  const overrideLabel = document.createElement("label");
  overrideLabel.className = "override-control";
  overrideLabel.textContent = "Sync target: ";

  const overrideSelect = document.createElement("select");
  overrideSelect.disabled = isBusy || lead.status === "invalid_ref_no";
  overrideSelect.value = currentLeadOverride;
  appendOverrideOption(overrideSelect, "parsed", "Use parsed priority");
  appendOverrideOption(
    overrideSelect,
    "quoted_false",
    "Override to Not Quoted (Level-0)",
  );
  appendOverrideOption(
    overrideSelect,
    "quoted_true",
    "Override to Quoted (Level-1)",
  );
  overrideSelect.addEventListener("change", () => {
    currentLeadOverride = overrideSelect.value as OverrideMode;
    currentLeadResult = undefined;
    render();
  });

  overrideLabel.append(overrideSelect);
  rowEl.append(overrideLabel);
  rowsEl.append(rowEl);
}

function renderCallLeadPreview() {
  rowsEl.textContent = "";

  if (!callLeadPreview?.sections.length) {
    return;
  }

  for (const section of callLeadPreview.sections) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "preview-section";

    const headingEl = document.createElement("div");
    headingEl.className = "preview-heading";

    const titleEl = document.createElement("span");
    titleEl.textContent = section.title;
    headingEl.append(titleEl);

    const countBadge = document.createElement("span");
    countBadge.className = section.tableFound ? "badge ok" : "badge warn";
    countBadge.textContent = section.tableFound
      ? `${section.rows.length} row(s)`
      : "not found";
    headingEl.append(countBadge);
    sectionEl.append(headingEl);

    if (!section.tableFound) {
      const emptyEl = document.createElement("p");
      emptyEl.textContent = `No ${section.title} table was found on this page.`;
      sectionEl.append(emptyEl);
      rowsEl.append(sectionEl);
      continue;
    }

    for (const row of section.rows) {
      sectionEl.append(renderCallLeadRow(section.key, row));
    }

    rowsEl.append(sectionEl);
  }
}

function renderCallLeadRow(
  sectionKey: CallLeadPreviewSection["key"],
  row: CallLeadPreviewRow,
): HTMLDivElement {
  const enrichment =
    sectionKey === "followUpEstimates"
      ? callLeadEnrichmentRows.find((preview) => preview.payload.row_id === row.id)
      : undefined;
  const result = enrichment?.result;
  const rowEl = document.createElement("div");
  rowEl.className = `row preview-row ${
    sectionKey === "followUpEstimates" && !canSyncCallEnrichmentRow(enrichment)
      ? "unsyncable"
      : ""
  }`;

  const headerEl = document.createElement("div");
  headerEl.className = "row-header";

  if (sectionKey === "followUpEstimates") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = !canSyncCallEnrichmentRow(enrichment);
    checkbox.checked = selectedCallRowIds.has(row.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedCallRowIds.add(row.id);
      } else {
        selectedCallRowIds.delete(row.id);
      }
      render();
    });
    headerEl.append(checkbox);
  }

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  const displayNumber = row.values.no || String(row.rowIndex);
  const jobNo = row.values.job_no ? ` ${row.values.job_no}` : "";
  const customer = row.values.customer ? ` - ${row.values.customer}` : "";
  titleEl.textContent = `#${displayNumber}${jobNo}${customer}`;
  headerEl.append(titleEl);
  if (result) {
    headerEl.append(callLeadResultBadge(result.status));
  } else if (sectionKey === "bookedJobs") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "preview only";
    headerEl.append(badge);
  }
  rowEl.append(headerEl);

  if (result) {
    const metaEl = document.createElement("div");
    metaEl.className = "row-meta";
    metaEl.textContent = [
      result.message,
      result.call_lead_id ? `call lead: ${result.call_lead_id}` : undefined,
      result.matched_phone_number ? `matched phone: ${result.matched_phone_number}` : undefined,
      result.changes.length ? `changes: ${result.changes.join(", ")}` : undefined,
      ...result.warnings,
    ]
      .filter(Boolean)
      .join(" | ");
    rowEl.append(metaEl);
  }

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid preview-grid";
  for (const [label, value] of Object.entries(row.values)) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  rowEl.append(fieldGrid);

  return rowEl;
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

function callLeadRowsToEnrichmentPayloads(
  preview: CallLeadPreviewResponse,
): CallLeadEnrichmentRowPayload[] {
  const followUp = preview.sections.find((section) => section.key === "followUpEstimates");
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

function getPreviewValue(row: CallLeadPreviewRow, key: string): string | undefined {
  const value = row.values[key];
  return value?.trim() || undefined;
}

function canSyncCallEnrichmentRow(row?: CallLeadEnrichmentPreview): boolean {
  return row?.result?.status === "updateable";
}

function callLeadResultBadge(status: CallLeadEnrichmentResult["status"]): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className =
    status === "updateable" || status === "updated"
      ? "badge ok"
      : status === "failed" || status === "conflict" || status === "invalid"
        ? "badge error"
        : "badge";
  badge.textContent = status;
  return badge;
}

function appendOverrideOption(
  select: HTMLSelectElement,
  value: OverrideMode,
  label: string,
) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function renderRows() {
  rowsEl.textContent = "";

  for (const row of parsedRows) {
    const rowEl = document.createElement("div");
    rowEl.className = `row ${isSyncableRow(row) ? "" : "unsyncable"}`;

    const headerEl = document.createElement("div");
    headerEl.className = "row-header";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = !isSyncableRow(row);
    checkbox.checked = selectedRowIds.has(row.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedRowIds.add(row.id);
      } else {
        selectedRowIds.delete(row.id);
      }
      render();
    });
    headerEl.append(checkbox);

    const titleEl = document.createElement("span");
    titleEl.className = "row-title";
    titleEl.textContent = `#${row.displayNumber || row.rowIndex} ${row.customer || "Unknown customer"}`;
    headerEl.append(titleEl);

    headerEl.append(statusBadge(row));
    const result = syncResults.get(row.id);
    if (result) {
      headerEl.append(resultBadge(result));
    }
    rowEl.append(headerEl);

    const metaEl = document.createElement("div");
    metaEl.className = "row-meta";
    metaEl.textContent = [
      `ref_no: ${row.refNo || "missing"}`,
      `Granot prior: ${row.prior || "missing"}`,
      `target quoted: ${typeof row.quoted === "boolean" ? row.quoted : "n/a"}`,
      `job_no: ${row.jobNo || "n/a"}`,
      `source: ${row.source || "n/a"}`,
      row.email ? `email: ${row.email}` : undefined,
      row.phone ? `phone: ${row.phone}` : undefined,
      row.reason,
      result?.message,
    ]
      .filter(Boolean)
      .join(" | ");
    rowEl.append(metaEl);
    rowsEl.append(rowEl);
  }
}

function updateControls() {
  const hasRows = parsedRows.length > 0;
  const hasSyncableRows = parsedRows.some(isSyncableRow);
  const hasSelectedRows = parsedRows.some((row) => selectedRowIds.has(row.id));
  const hasCallRows = callLeadEnrichmentRows.length > 0;
  const hasSyncableCallRows = callLeadEnrichmentRows.some(canSyncCallEnrichmentRow);
  const hasSelectedCallRows = callLeadEnrichmentRows.some((row) =>
    selectedCallRowIds.has(row.payload.row_id),
  );

  scanCurrentPageBtn.disabled = isBusy;
  syncCurrentLeadBtn.disabled = isBusy || !canSyncCurrentLead();
  scanFollowUpBtn.disabled = isBusy;
  scanCallLeadsBtn.disabled = isBusy;
  syncCallSelectedBtn.disabled = isBusy || !hasSelectedCallRows;
  syncCallAllBtn.disabled = isBusy || !hasSyncableCallRows;
  selectAllCallBtn.disabled = isBusy || !hasSyncableCallRows;
  deselectAllCallBtn.disabled = isBusy || !hasCallRows;
  dumpBtn.disabled = isBusy;
  diagnoseBtn.disabled = isBusy;
  openDetachedBtn.disabled = isBusy || isDetachedWindow;
  syncSelectedBtn.disabled = isBusy || !hasSelectedRows;
  syncAllBtn.disabled = isBusy || !hasSyncableRows;
  selectAllBtn.disabled = isBusy || !hasSyncableRows;
  deselectAllBtn.disabled = isBusy || !hasRows;
}

function setBusy(nextIsBusy: boolean) {
  isBusy = nextIsBusy;
  updateControls();
}

function isSyncableRow(row: FollowUpRow): boolean {
  return row.status === "syncable" && typeof row.quoted === "boolean";
}

function rowToSyncCandidate(row: FollowUpRow): LeadSyncCandidate {
  return {
    id: row.id,
    refNo: row.refNo,
    quoted: row.quoted,
    status: row.status,
  };
}

function getCurrentLeadTargetQuoted(): boolean | undefined {
  if (!currentLeadPreview) {
    return undefined;
  }

  if (currentLeadOverride === "quoted_false") {
    return false;
  }

  if (currentLeadOverride === "quoted_true") {
    return true;
  }

  return currentLeadPreview.lead.quoted;
}

function canSyncCurrentLead(): boolean {
  if (
    !currentLeadPreview ||
    currentLeadPreview.lead.status === "invalid_ref_no"
  ) {
    return false;
  }

  return typeof getCurrentLeadTargetQuoted() === "boolean";
}

function statusBadge(row: { status: LeadStatus }): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = row.status === "syncable" ? "badge ok" : "badge warn";
  badge.textContent =
    row.status === "syncable"
      ? "syncable"
      : row.status === "unsupported_prior"
        ? "unsupported prior"
        : "invalid";
  return badge;
}

function resultBadge(result: RowSyncResult): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className =
    result.status === "updated"
      ? "badge ok"
      : result.status === "failed"
        ? "badge error"
        : "badge";
  badge.textContent = result.status;
  return badge;
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
    return `0/${total} frames responded to PING. Content script never injected. Reload the tab and the add-on. See per-frame report below.`;
  }

  return `${responding}/${total} frames responded. See report below.`;
}

function renderDiagnostics(report: DiagnosticsReport): void {
  followUpPanel.classList.remove("active");
  currentLeadPanel.classList.remove("active");
  callLeadsPanel.classList.remove("active");
  summaryEl.hidden = false;
  summaryEl.textContent = `${report.manifestName} v${report.manifestVersion} (${report.browser}, MV${report.manifestVersionNumber}) — runtime id ${report.manifestRuntimeId}`;

  rowsEl.textContent = "";
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

  rowsEl.append(container);
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

function matchPatternMatches(pattern: string, url: string): boolean {
  // Mirrors @webext-core/match-patterns. Path matching is wildcard-only.
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
