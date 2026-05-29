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
  BookedCallLeadMatchMethod,
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
  CallLeadMatchMethod,
} from "../../../../utils/api";
import type { AppContext } from "../../app/context";
import { updateSidebarPulses } from "../../app/render";
import {
  buildCycleElement,
  buildLogGrid,
  buildTablePreviewAccordion,
  callLeadResultBadge,
  compactChip,
  fieldBlock,
} from "../../ui/components";
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

  const byPhone =
    cl.enrichmentRows.filter(
      (row) =>
        row.result?.match_method === "phone_only" ||
        row.result?.match_method === "phone_and_job_no",
    ).length +
    cl.bookedReconciliationRows.filter(
      (row) => row.result?.match_method === "phone_only",
    ).length;
  const byJobNo =
    cl.enrichmentRows.filter(
      (row) => row.result?.match_method === "job_no_only",
    ).length +
    cl.bookedReconciliationRows.filter(
      (row) =>
        row.result?.match_method === "job_no_only" ||
        row.result?.match_method === "job_no_with_booking",
    ).length;
  const withBooking =
    cl.enrichmentRows.filter((row) => row.result?.has_booking).length +
    cl.bookedReconciliationRows.filter((row) => row.result?.has_booking).length;
  const notFound =
    cl.enrichmentRows.filter((row) => row.result?.status === "no_match")
      .length +
    cl.bookedReconciliationRows.filter(
      (row) => row.result?.status === "no_match",
    ).length;

  const matchSummaryParts = [
    byPhone > 0 ? `${byPhone} matched by phone` : "",
    byJobNo > 0 ? `${byJobNo} matched by job_no` : "",
    withBooking > 0 ? `${withBooking} with booking` : "",
    notFound > 0 ? `${notFound} not found` : "",
  ].filter(Boolean);

  const matchSummary = matchSummaryParts.length
    ? ` Matches: ${matchSummaryParts.join(", ")}.`
    : "";

  dom.cl.summary.hidden = false;
  dom.cl.summary.textContent = `${foundSections.length} table(s) found · ${followUpCount} follow-up row(s) · ${updateable} updateable · ${bookedCount} booked row(s) · ${bookedUpdateable} booked updateable · ${selected} selected.${matchSummary}`;
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
    matchMethod: reconciliation?.result?.match_method,
    hasBooking: reconciliation?.result?.has_booking,
    selectable: false,
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
    matchMethod: enrichment?.result?.match_method,
    hasBooking: enrichment?.result?.has_booking,
    selectable: true,
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
    matchMethod?: CallLeadMatchMethod | BookedCallLeadMatchMethod;
    hasBooking?: boolean;
    selectable: boolean;
  },
): HTMLDetailsElement {
  const { row, workflow, result, canSync, onSync, matchMethod, hasBooking } =
    opts;
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

  const compact = document.createElement("span");
  compact.className = "row-compact";

  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  const displayNumber = row.values.no || String(row.rowIndex);
  const jobNo = row.values.job_no ? ` ${row.values.job_no}` : "";
  const customer = row.values.customer ? ` - ${row.values.customer}` : "";
  titleEl.textContent = `#${displayNumber}${jobNo}${customer}`;
  compact.append(titleEl);

  for (const chip of buildCallLeadCompactChips(row, workflow)) {
    compact.append(chip);
  }

  if (matchMethod) {
    compact.append(buildCallLeadMatchChip(matchMethod, Boolean(hasBooking)));
  }
  summary.append(compact);

  if (result) {
    summary.append(callLeadResultBadge(result.status));
  } else if (workflow === "booked") {
    const badge = document.createElement("span");
    badge.className = "badge muted";
    badge.textContent = "booked";
    summary.append(badge);
  }

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

  if (result?.message) {
    const banner = document.createElement("div");
    banner.className = buildCallLeadResultBannerClass(result.status);
    banner.style.marginBottom = "10px";
    banner.textContent = result.message;
    body.append(banner);
  }

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "field-grid";
  for (const [label, value] of Object.entries(row.values)) {
    fieldGrid.append(fieldBlock(label, value || "blank"));
  }
  body.append(fieldGrid);

  if (result) {
    const metaParts = [
      result.call_lead_id ? `call lead: ${result.call_lead_id}` : undefined,
      "matched_phone_number" in result && result.matched_phone_number
        ? `matched phone: ${result.matched_phone_number}`
        : undefined,
      "booking_id" in result && result.booking_id
        ? `booking: ${result.booking_id}`
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
      body.append(metaEl);
    }
  }

  details.append(body);
  return details;
}

function buildCallLeadCompactChips(
  row: CallLeadPreviewRow,
  workflow: "followUp" | "booked",
): HTMLSpanElement[] {
  const chips: HTMLSpanElement[] = [];
  if (row.values.job_no) chips.push(compactChip("job_no", row.values.job_no));
  if (row.values.phone) chips.push(compactChip("phone", row.values.phone));
  if (row.values.est_cf) chips.push(compactChip("est_cf", row.values.est_cf));
  if (workflow === "booked" && row.values.source) {
    chips.push(compactChip("source", row.values.source));
  }
  return chips;
}

function buildCallLeadMatchChip(
  method: CallLeadMatchMethod | BookedCallLeadMatchMethod,
  hasBooking: boolean,
): HTMLSpanElement {
  const chip = document.createElement("span");
  switch (method) {
    case "phone_and_job_no":
      chip.className = "match-chip";
      chip.textContent = "by phone + job_no";
      break;
    case "phone_only":
      chip.className = "match-chip is-phone";
      chip.textContent = "by phone";
      break;
    case "job_no_only":
      chip.className = "match-chip is-job";
      chip.textContent = "by job_no";
      break;
    case "job_no_with_booking":
      chip.className = "match-chip is-booking";
      chip.textContent = "booking by job_no";
      return chip;
    case "none":
    default:
      chip.className = "match-chip is-missing";
      chip.textContent = "not found";
      return chip;
  }
  if (hasBooking) {
    chip.textContent += " · has booking";
    chip.classList.add("is-booking");
  }
  return chip;
}

function buildCallLeadResultBannerClass(status: string): string {
  if (status === "updated") return "banner info";
  if (status === "updateable") return "banner warn";
  if (status === "unchanged") return "banner info";
  if (
    status === "failed" ||
    status === "conflict" ||
    status === "invalid" ||
    status === "no_match" ||
    status === "booking_missing"
  ) {
    return "banner error";
  }
  return "banner info";
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
  dom.cl.syncAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.cl.selectAll.disabled = isBusy || autoRunning || !hasSyncableRows;
  dom.cl.deselectAll.disabled = isBusy || autoRunning || !hasRows;
  const hasAnyCallRows =
    cl.preview?.sections.some((section) => section.rows.length > 0) ?? false;
  dom.cl.expandAll.disabled = isBusy || autoRunning || !hasAnyCallRows;
  dom.cl.collapseAll.disabled = isBusy || autoRunning || !hasAnyCallRows;
  dom.cl.intervalValue.disabled = autoRunning;
  dom.cl.intervalUnit.disabled = autoRunning;
  dom.cl.autoStart.disabled = isBusy || autoRunning;
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
