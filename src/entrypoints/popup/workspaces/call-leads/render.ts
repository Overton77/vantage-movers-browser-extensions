// Call Leads workspace rendering. Builds the summary line, the Follow Up
// Estimates row accordions, the Booked Jobs accordion, per-row match chips, the
// controls' disabled state, the auto meta badge, and the inline Log Tables
// panel. Extracted from `popup/main.ts` in Unit 07. Per-row Sync buttons
// delegate to the workspace actions module.
import { formatIntervalLabel } from "../../../../auto-sync/cycles";
import {
  canSyncBookedCallReconciliationRow,
  canSyncCallEnrichmentRow,
} from "../../../../workflows/call-leads/payloads";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadPreviewRow,
} from "../../../../workflows/call-leads/types";
import type {
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
} from "../../../../utils/api";
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
  buildCallLeadCollapsedModel,
  buildCallLeadExpandedSummary,
  buildCallLeadScanMetrics,
} from "../../ui/leadMessaging";
import { syncBookedCallRows, syncCallRows } from "./actions";

export function renderCallLeads(app: AppContext): void {
  renderCallLeadsSummary(app);
  renderCallLeadsRows(app);
  renderCallLeadsHistory(app);
  renderCallLeadsControls(app);
  renderCallLeadsAutoMeta(app);
  updateSidebarPulses(app);
}

function renderCallLeadsSummary(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
  if (!cl.hasScanned || !cl.preview) {
    dom.cl.summary.hidden = true;
    dom.cl.summary.textContent = "";
    return;
  }

  dom.cl.summary.hidden = false;
  dom.cl.summary.textContent = "";
  dom.cl.summary.append(summaryMetrics(buildCallLeadScanMetrics(cl)));
}

function renderCallLeadsRows(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
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
      shouldShowCallFollowUpRow(app, row),
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
        accordion.body.append(buildCallLeadRowElement(app, row));
      }
    }

    dom.cl.rows.append(accordion.details);
  } else {
    dom.cl.rowlistCard.style.display = "none";
  }

  // Booked Jobs (table-level accordion; default open after scan)
  renderCallLeadsBookedAccordion(app);
}

function renderCallLeadsBookedAccordion(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
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
  const summaryText = `Booked Jobs · ${booked.rows.length} job(s) · ${bookedUpdateable} updateable by job/phone/source`;
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
    accordion.body.append(buildBookedRowElement(app, row, reconciliation));
  }

  dom.cl.bookedContainer.append(accordion.details);
}

function buildBookedRowElement(
  app: AppContext,
  row: CallLeadPreviewRow,
  reconciliation?: BookedCallLeadReconciliationPreview,
): HTMLDetailsElement {
  return buildCallRowAccordion(app, {
    row,
    workflow: "booked",
    result: reconciliation?.result,
    canSync: canSyncBookedCallReconciliationRow(reconciliation),
    onSync: reconciliation
      ? () => void syncBookedCallRows(app, [reconciliation.payload])
      : undefined,
    selectable: false,
    leadId: reconciliation?.result?.call_lead_id,
    linkedName: reconciliation?.result?.receiver_agent_name_snapshot,
  });
}

function buildCallLeadRowElement(
  app: AppContext,
  row: CallLeadPreviewRow,
): HTMLDetailsElement {
  const cl = app.state.callLeads;
  const enrichment = cl.enrichmentRows.find(
    (preview) => preview.payload.row_id === row.id,
  );
  return buildCallRowAccordion(app, {
    row,
    workflow: "followUp",
    result: enrichment?.result,
    canSync: canSyncCallEnrichmentRow(enrichment),
    onSync: enrichment
      ? () => void syncCallRows(app, [enrichment.payload])
      : undefined,
    selectable: true,
    leadId: enrichment?.result?.call_lead_id,
    linkedName: enrichment?.result?.receiver_agent_name_snapshot,
  });
}

/**
 * Shared call-lead row builder used by both Follow Up Estimates and
 * Booked Jobs tables — keeps the two views consistent. Each row is a
 * `<details>` accordion with a compact one-line summary (checkbox, title,
 * compact chips, match-method chip, status, sync button) and a body with
 * the full field grid, the API result message and any warnings.
 */
function buildCallRowAccordion(
  app: AppContext,
  opts: {
    row: CallLeadPreviewRow;
    workflow: "followUp" | "booked";
    result?:
      | CallLeadEnrichmentResult
      | BookedCallLeadReconciliationResult
      | undefined;
    canSync: boolean;
    onSync?: () => void;
    selectable: boolean;
    /** Resolved Vantage `_id` for the Sales Rep control; undefined hides it. */
    leadId?: string;
    linkedName?: string;
  },
): HTMLDetailsElement {
  const { row, workflow, result, canSync, onSync } = opts;
  const cl = app.state.callLeads;

  const details = document.createElement("details");
  details.className = `row ${canSync ? "" : "unsyncable"}`;
  details.open = cl.openRowIds.has(row.id);
  details.addEventListener("toggle", () => {
    if (details.open) {
      cl.openRowIds.add(row.id);
    } else {
      cl.openRowIds.delete(row.id);
    }
  });

  const summary = document.createElement("summary");

  if (opts.selectable && canSync) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = app.state.isBusy;
    checkbox.checked = cl.selectedRowIds.has(row.id);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        cl.selectedRowIds.add(row.id);
      } else {
        cl.selectedRowIds.delete(row.id);
      }
      renderCallLeads(app);
    });
    summary.append(checkbox);
  }

  const rowKey = `call:${workflow}:${row.id}`;
  const linkedName =
    app.state.agents.linkedOverrides.get(rowKey) ?? opts.linkedName;
  summary.append(
    rowStateCard(
      buildCallLeadCollapsedModel(row, workflow, result, canSync, {
        linkedName,
      }),
    ),
  );

  const actions = document.createElement("div");
  actions.className = "row-header__actions";

  if (canSync && onSync) {
    const syncBtn = document.createElement("button");
    syncBtn.className = "btn-sm";
    syncBtn.textContent = "Sync";
    syncBtn.disabled = app.state.isBusy;
    syncBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSync();
    });
    actions.append(syncBtn);
  }
  summary.append(actions);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "row__body";

  body.append(
    rowStateCard(
      buildCallLeadExpandedSummary(row, workflow, result, {
        linkedName,
      }),
    ),
  );

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(row.values)) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  body.append(fieldGrid);

  if (result) {
    const metaParts = [
      result.call_lead_id ? `call lead: ${result.call_lead_id}` : undefined,
      "booking_id" in result && result.booking_id
        ? `booking: ${result.booking_id}`
        : undefined,
    ].filter(Boolean) as string[];
    if (metaParts.length > 0) {
      const metaEl = document.createElement("div");
      metaEl.className = "row-meta";
      metaEl.textContent = metaParts.join(" | ");
      body.append(metaEl);
    }
  }

  details.append(body);
  return details;
}

export function renderCallLeadsHistory(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
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

function renderCallLeadsControls(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
  const isBusy = app.state.isBusy;
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
  dom.cl.syncAll.disabled =
    isBusy || autoRunning || (!hasSyncableRows && !hasSyncableBookedRows);
  dom.cl.selectAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.cl.deselectAll.disabled = isBusy || autoRunning || !hasRows;
  const hasAnyCallRows =
    cl.preview?.sections.some((section) => section.rows.length > 0) ?? false;
  dom.cl.expandAll.disabled = isBusy || autoRunning || !hasAnyCallRows;
  dom.cl.collapseAll.disabled = isBusy || autoRunning || !hasAnyCallRows;
  dom.cl.intervalValue.disabled = autoRunning;
  dom.cl.intervalUnit.disabled = autoRunning;
  dom.cl.autoStart.disabled =
    isBusy || autoRunning || (!hasSyncableRows && !hasSyncableBookedRows);
  dom.cl.autoStop.disabled = !autoRunning;
}

function renderCallLeadsAutoMeta(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
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

export function renderCallLeadsLogTables(app: AppContext): void {
  const { dom } = app;
  const cl = app.state.callLeads;
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
      from: row.values.from || "",
      from_zip: row.values.from_zip || "",
      to: row.values.to || "",
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
      from: row.values.from || "",
      from_zip: row.values.from_zip || "",
      to: row.values.to || "",
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
    cl.logTablesOpen = false;
    renderCallLeadsLogTables(app);
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

export function shouldShowCallFollowUpRow(
  app: AppContext,
  row: CallLeadPreviewRow,
): boolean {
  const filter = app.state.callLeads.progressFilter;
  const enrichment = app.state.callLeads.enrichmentRows.find(
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
