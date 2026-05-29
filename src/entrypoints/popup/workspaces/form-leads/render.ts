// Form Leads workspace rendering. Builds the summary line, the row accordions,
// per-row Vantage preview chips/blocks, the controls' disabled state, the auto
// meta badge, and the inline Log Tables panel. Extracted from `popup/main.ts` in
// Unit 07. Receives the shared app context; per-row Sync buttons delegate to the
// workspace actions module.
import { formatIntervalLabel } from "../../../../auto-sync/cycles";
import {
  isSyncableRow,
} from "../../../../workflows/form-leads/payloads";
import type {
  FollowUpRow,
  FormLeadMatchState,
  FormLeadRowPreview,
} from "../../../../workflows/form-leads/types";
import type { AppContext } from "../../app/context";
import { updateSidebarPulses } from "../../app/render";
import {
  buildCycleElement,
  buildLogGrid,
  buildTablePreviewAccordion,
  compactChip,
  fieldBlock,
  resultBadge,
  statusBadge,
} from "../../ui/components";
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
  const syncableRows = fl.parsedRows.filter(isSyncableRow);
  const syncable = syncableRows.length;
  const unsupported = fl.parsedRows.filter(
    (row) => row.status === "unsupported_prior",
  ).length;
  const invalid = fl.parsedRows.filter(
    (row) => row.status === "invalid_ref_no" || row.status === "missing_prior",
  ).length;
  const selected = fl.parsedRows.filter((row) =>
    fl.selectedRowIds.has(row.id),
  ).length;

  let previewLine = "";
  if (fl.previews.size > 0) {
    const states: Record<FormLeadMatchState, number> = {
      has_booking: 0,
      idempotent: 0,
      will_update: 0,
      not_found: 0,
      preview_error: 0,
      pending: 0,
    };
    for (const row of syncableRows) {
      const preview = fl.previews.get(row.id);
      if (preview) {
        states[preview.state] += 1;
      } else {
        states.pending += 1;
      }
    }
    const parts = [
      states.has_booking > 0 ? `${states.has_booking} with booking` : "",
      states.idempotent > 0 ? `${states.idempotent} already match` : "",
      states.will_update > 0 ? `${states.will_update} will update` : "",
      states.not_found > 0 ? `${states.not_found} not found` : "",
      states.preview_error > 0
        ? `${states.preview_error} preview error(s)`
        : "",
    ].filter(Boolean);
    if (parts.length > 0) {
      previewLine = ` Vantage preview: ${parts.join(", ")}.`;
    }
  }

  dom.fl.summary.hidden = false;
  dom.fl.summary.textContent = `${fl.parsedRows.length} parsed row(s): ${syncable} syncable, ${unsupported} unsupported prior, ${invalid} invalid. ${selected} selected.${previewLine}`;
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

  const syncableCount = fl.parsedRows.filter(isSyncableRow).length;
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
  const syncable = isSyncableRow(row);
  const result = fl.syncResults.get(row.id);
  const preview = fl.previews.get(row.id);

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

  const compact = document.createElement("span");
  compact.className = "row-compact";
  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  titleEl.textContent = `${row.tableTitle ?? "Follow Up Estimates"} #${row.displayNumber || row.rowIndex} ${
    row.customer || "Unknown customer"
  }`;
  compact.append(titleEl);
  for (const chip of buildFormLeadCompactChips(row)) {
    compact.append(chip);
  }
  if (syncable && preview) {
    compact.append(buildFormLeadMatchChip(preview));
  }
  summary.append(compact);

  summary.append(statusBadge(row));
  if (result) {
    summary.append(resultBadge(result));
  }

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

  if (syncable && preview) {
    body.append(buildFormLeadPreviewBlock(preview));
  }

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(formLeadRowFields(row))) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  body.append(fieldGrid);

  const messageParts = [row.reason, result?.message].filter(
    Boolean,
  ) as string[];
  if (messageParts.length > 0) {
    const metaEl = document.createElement("div");
    metaEl.className = "row-meta";
    metaEl.textContent = messageParts.join(" | ");
    body.append(metaEl);
  }

  details.append(body);
  return details;
}

function buildFormLeadCompactChips(row: FollowUpRow): HTMLSpanElement[] {
  const chips: HTMLSpanElement[] = [];
  if (row.jobNo) chips.push(compactChip("job_no", row.jobNo));
  if (row.refNo) chips.push(compactChip("ref_no", row.refNo));
  if (typeof row.quoted === "boolean") {
    chips.push(compactChip("quoted", String(row.quoted)));
  }
  if (typeof row.cubicFeet === "number") {
    chips.push(compactChip("cubic_feet", String(row.cubicFeet)));
  }
  if (row.prior) chips.push(compactChip("prior", row.prior));
  return chips;
}

function buildFormLeadMatchChip(preview: FormLeadRowPreview): HTMLSpanElement {
  const chip = document.createElement("span");
  switch (preview.state) {
    case "has_booking":
      chip.className = "match-chip is-booking";
      chip.textContent = "found · has booking";
      break;
    case "idempotent":
      chip.className = "match-chip is-idempotent";
      chip.textContent = "found · idempotent";
      break;
    case "will_update":
      chip.className = "match-chip is-changes";
      chip.textContent = `found · will update ${preview.changes.length} field${preview.changes.length === 1 ? "" : "s"}`;
      break;
    case "not_found":
      chip.className = "match-chip is-missing";
      chip.textContent = "not found in Vantage";
      break;
    case "preview_error":
      chip.className = "match-chip is-missing";
      chip.textContent = "preview error";
      break;
    case "pending":
    default:
      chip.className = "match-chip";
      chip.textContent = "previewing…";
      break;
  }
  return chip;
}

function buildFormLeadPreviewBlock(
  preview: FormLeadRowPreview,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className =
    preview.state === "not_found" || preview.state === "preview_error"
      ? "banner error"
      : preview.state === "will_update"
        ? "banner warn"
        : "banner info";
  wrapper.style.marginBottom = "10px";
  wrapper.textContent = preview.message;
  return wrapper;
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
    return isSyncableRow(row);
  }
  if (filter === "failed") {
    return app.state.formLeads.syncResults.get(row.id)?.status === "failed";
  }
  return true;
}
