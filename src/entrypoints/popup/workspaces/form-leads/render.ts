// Form Leads workspace rendering. Builds the scan metrics, row accordions,
// per-row Vantage preview blocks, the controls' disabled state, the auto
// meta badge, and the inline Log Tables panel. Extracted from `popup/main.ts` in
// Unit 07. Receives the shared app context; per-row Sync buttons delegate to the
// workspace actions module.
import { formatIntervalLabel } from "../../../../auto-sync/cycles";
import { isRowSyncable } from "../../../../workflows/form-leads/payloads";
import type {
  FollowUpRow,
} from "../../../../workflows/form-leads/types";
import type { AppContext } from "../../app/context";
import { updateSidebarPulses } from "../../app/render";
import {
  buildCycleElement,
  buildLogGrid,
  buildTablePreviewAccordion,
  fieldBlock,
  rowStateCard,
  summaryMetrics,
} from "../../ui/components";
import {
  buildFormLeadCollapsedModel,
  buildFormLeadExpandedSummary,
  buildFormLeadScanMetrics,
} from "../../ui/leadMessaging";
import { syncRows } from "./actions";

export function renderFormLeads(app: AppContext): void {
  renderFormLeadsSummary(app);
  renderFormLeadsRows(app);
  renderFormLeadsHistory(app);
  renderFormLeadsControls(app);
  renderFormLeadsAutoMeta(app);
  updateSidebarPulses(app);
}

function renderFormLeadsSummary(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
  if (!fl.hasScanned || fl.parsedRows.length === 0) {
    dom.fl.summary.hidden = true;
    dom.fl.summary.textContent = "";
    return;
  }

  dom.fl.summary.hidden = false;
  dom.fl.summary.textContent = "";
  dom.fl.summary.append(summaryMetrics(buildFormLeadScanMetrics(fl)));
}

function renderFormLeadsRows(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
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
      "<strong>No rows found</strong>The scan found Booked Jobs / Follow Up Estimates tables but no parseable rows.";
    return;
  }

  dom.fl.empty.style.display = "none";
  dom.fl.rowlistCard.style.display = "block";
  dom.fl.rows.textContent = "";

  const rowsToRender = fl.parsedRows.filter((row) =>
    shouldShowFollowUpRow(app, row),
  );

  const syncableCount = fl.parsedRows.filter((row) =>
    isRowSyncable(row, fl.previews.get(row.id)),
  ).length;
  const bookedCount = fl.parsedRows.filter(
    (row) => row.tableSource === "bookedJobs",
  ).length;
  const followUpCount = fl.parsedRows.filter(
    (row) => row.tableSource !== "bookedJobs",
  ).length;
  const summaryText = `Form Lead rows · ${fl.parsedRows.length} row(s) · ${syncableCount} syncable · ${bookedCount} booked · ${followUpCount} follow-up`;
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
      accordion.body.append(buildFormLeadRowElement(app, row));
    }
  }

  dom.fl.rows.append(accordion.details);
}

function buildFormLeadRowElement(
  app: AppContext,
  row: FollowUpRow,
): HTMLDetailsElement {
  const fl = app.state.formLeads;
  const result = fl.syncResults.get(row.id);
  const preview = fl.previews.get(row.id);
  const syncable = isRowSyncable(row, preview);

  const details = document.createElement("details");
  details.className = `row ${syncable ? "" : "unsyncable"}`;
  details.open = fl.openRowIds.has(row.id);
  details.addEventListener("toggle", () => {
    if (details.open) {
      fl.openRowIds.add(row.id);
    } else {
      fl.openRowIds.delete(row.id);
    }
  });

  const summary = document.createElement("summary");

  if (syncable) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = app.state.isBusy;
    checkbox.checked = fl.selectedRowIds.has(row.id);
    checkbox.addEventListener("click", (event) => {
      // Prevent the checkbox click from toggling the accordion.
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        fl.selectedRowIds.add(row.id);
      } else {
        fl.selectedRowIds.delete(row.id);
      }
      renderFormLeads(app);
    });
    summary.append(checkbox);
  }

  const rowKey = `form:${row.id}`;
  const linkedName =
    app.state.agents.linkedOverrides.get(rowKey) ??
    result?.current?.receiver_agent_name_snapshot ??
    preview?.current?.receiver_agent_name_snapshot;
  summary.append(
    rowStateCard(
      buildFormLeadCollapsedModel(row, preview, result, syncable, {
        linkedName,
      }),
    ),
  );

  const actions = document.createElement("div");
  actions.className = "row-header__actions";

  if (syncable) {
    const syncBtn = document.createElement("button");
    syncBtn.className = "btn-sm";
    syncBtn.textContent = "Sync";
    syncBtn.disabled = app.state.isBusy;
    syncBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void syncRows(app, [row]);
    });
    actions.append(syncBtn);
  }
  summary.append(actions);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "row__body";

  body.append(
    rowStateCard(
      buildFormLeadExpandedSummary(row, preview, result, {
        linkedName,
      }),
    ),
  );

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(formLeadRowFields(row))) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  body.append(fieldGrid);

  details.append(body);
  return details;
}

function formLeadRowFields(row: FollowUpRow): Record<string, string> {
  return {
    table: row.tableTitle ?? "Follow Up Estimates",
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
    sales_rep_raw: row.salesRepRaw ?? "",
  };
}

export function renderFormLeadsHistory(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
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

function renderFormLeadsControls(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
  const isBusy = app.state.isBusy;
  const autoRunning = fl.autoRunning;
  const hasRows = fl.parsedRows.length > 0;
  const hasSyncableRows = fl.parsedRows.some((row) =>
    isRowSyncable(row, fl.previews.get(row.id)),
  );
  const hasSelectedRows = fl.parsedRows.some((row) =>
    fl.selectedRowIds.has(row.id),
  );

  dom.fl.scan.disabled = isBusy || autoRunning;
  dom.fl.log.disabled = isBusy;
  dom.fl.syncSelected.disabled = isBusy || autoRunning || !hasSelectedRows;
  dom.fl.syncAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.fl.selectAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.fl.deselectAll.disabled = isBusy || autoRunning || !hasRows;
  dom.fl.expandAll.disabled = isBusy || autoRunning || !hasRows;
  dom.fl.collapseAll.disabled = isBusy || autoRunning || !hasRows;
  dom.fl.intervalValue.disabled = autoRunning;
  dom.fl.intervalUnit.disabled = autoRunning;
  dom.fl.autoStart.disabled = isBusy || autoRunning;
  dom.fl.autoStop.disabled = !autoRunning;
}

function renderFormLeadsAutoMeta(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
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

export function renderFormLeadsLogTables(app: AppContext): void {
  const { dom } = app;
  const fl = app.state.formLeads;
  dom.fl.logContainer.textContent = "";
  if (!fl.logTablesOpen || !fl.hasScanned) {
    return;
  }

  const consoleRows = fl.parsedRows.map((row) => ({
    table: row.tableTitle || "Follow Up Estimates",
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
    sales_rep_raw: row.salesRepRaw || "",
    status: row.status,
    reason: row.reason || "",
  }));
  console.groupCollapsed("[Granot Sync] Form Leads — Booked Jobs / Follow Up Estimates");
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
    fl.logTablesOpen = false;
    renderFormLeadsLogTables(app);
  });
  summary.append(close);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "log-tables__body";
  body.append(buildLogGrid(consoleRows, (row) => row.status !== "syncable"));
  details.append(body);

  dom.fl.logContainer.append(details);
}

export function shouldShowFollowUpRow(
  app: AppContext,
  row: FollowUpRow,
): boolean {
  const filter = app.state.formLeads.progressFilter;
  if (filter === "syncable") {
    return isRowSyncable(row, app.state.formLeads.previews.get(row.id));
  }
  if (filter === "failed") {
    return app.state.formLeads.syncResults.get(row.id)?.status === "failed";
  }
  return true;
}
