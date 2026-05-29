// Reusable popup UI primitives — pure DOM builders with no state or app-context
// dependency. Extracted from `popup/main.ts` in Unit 07 so workspace render
// modules can share chips, field blocks, accordions, badges, the log-table
// grid, and the cycle-history accordion.
import type { CycleDetail, CycleEntry } from "../../../auto-sync/cycles";
import type { ProgressFilter } from "../../../app/state";
import type { LeadStatus, RowSyncResult } from "../../../workflows/form-leads/types";

export function compactChip(label: string, value: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "row-compact__chip";
  const labelEl = document.createElement("span");
  labelEl.className = "row-compact__chip-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.className = "row-compact__chip-value";
  valueEl.textContent = value;
  chip.append(labelEl, valueEl);
  return chip;
}

export function fieldBlock(label: string, value: string): HTMLDivElement {
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

export function statusBadge(row: { status: LeadStatus }): HTMLSpanElement {
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

export function resultBadge(result: RowSyncResult): HTMLSpanElement {
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

export function callLeadResultBadge(status: string): HTMLSpanElement {
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

export function buildTablePreviewAccordion(options: {
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

export function buildLogGrid<T extends Record<string, unknown>>(
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

export function buildCycleElement(
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

export function filterCycleDetails(
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

export function cycleDetailIcon(status: CycleDetail["status"]): string {
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

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
