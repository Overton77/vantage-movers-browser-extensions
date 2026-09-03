import { isTariffAdjustmentComplete } from "../../../../workflows/tariff-adjustment/preview";
import type { TariffAdjustmentRow } from "../../../../parsers/granot/tariff-adjustment";
import type { AppContext } from "../../app/context";

const ROW_FIELDS: Array<{
  key: keyof TariffAdjustmentRow;
  label: string;
}> = [
  { key: "effectiveDate", label: "Effective Date" },
  { key: "pickupZone", label: "Pickup Zone" },
  { key: "deliveryZone", label: "Delivery Zone" },
  { key: "service", label: "Service" },
  { key: "rule", label: "Rule" },
  { key: "newRule", label: "New Rule" },
  { key: "carrier", label: "Carrier" },
];

export function renderTariffAdjustment(app: AppContext): void {
  const { dom, state } = app;
  const slice = state.tariffAdjustment;
  const complete = isTariffAdjustmentComplete(slice.parseResult);
  const detachedDisabled =
    state.isBusy || app.isDetachedWindow || !state.auth.session;

  dom.ta.checkApprove.disabled = state.isBusy;
  dom.ta.writeNow.disabled = state.isBusy;
  dom.ta.approve.disabled = state.isBusy || !slice.awaitingApproval || !complete;
  dom.ta.openDetached.disabled = detachedDisabled;
  dom.ta.content.textContent = "";

  if (!slice.parseResult) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<strong>No Forms View parsed yet</strong>Open a Granot Forms View on the active tab. This workspace reads the page and writes two Tariff Adjustment rows to Vantage.";
    dom.ta.content.append(empty);
    return;
  }

  if (!slice.parseResult.pageFound) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<strong>Not a Forms View</strong>This tab is not a Granot Forms View, so nothing was written. Open an edit form, then use Check and Approve or Write Now.";
    dom.ta.content.append(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h3");
  title.className = "card__title";
  title.textContent = "Printed Tariff Adjustments";
  card.append(title);

  if (slice.parseResult.missing.length > 0) {
    const banner = document.createElement("div");
    banner.className = "banner error";
    banner.style.marginBottom = "12px";
    banner.textContent = `Missing required fields: ${slice.parseResult.missing.join(", ")}`;
    card.append(banner);
  }

  for (const row of slice.printedRows ?? slice.parseResult.rows) {
    card.append(renderRow(row));
  }

  if (slice.awaitingApproval) {
    const hint = document.createElement("p");
    hint.className = "status-text";
    hint.style.marginTop = "12px";
    hint.textContent = complete
      ? "These are the rows that Approve will write. They will not be re-read from the page."
      : "Approve stays off until every required field is present.";
    card.append(hint);
  }

  if (slice.submitResult) {
    const banner = document.createElement("div");
    banner.className = "banner info";
    banner.style.marginTop = "12px";
    banner.textContent = [
      `Appended ${slice.submitResult.appended} on ${slice.submitResult.tab_name}`,
      slice.submitResult.updated_range,
    ]
      .filter(Boolean)
      .join(" · ");
    card.append(banner);

    for (const written of slice.submitResult.rows) {
      const meta = document.createElement("div");
      meta.className = "row-meta";
      meta.textContent = written.join(" · ");
      card.append(meta);
    }
  }

  if (slice.error) {
    const banner = document.createElement("div");
    banner.className = "banner error";
    banner.style.marginTop = "12px";
    banner.textContent = slice.error;
    card.append(banner);
  }

  dom.ta.content.append(card);
}

function renderRow(row: TariffAdjustmentRow): HTMLElement {
  const block = document.createElement("div");
  block.style.marginTop = "12px";

  const heading = document.createElement("div");
  heading.className = "card__title";
  heading.style.fontSize = "13px";
  heading.textContent = row.service;
  block.append(heading);

  const grid = document.createElement("div");
  grid.className = "field-grid";
  for (const field of ROW_FIELDS) {
    const cell = document.createElement("div");
    cell.className = "field";
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = field.label;
    const value = document.createElement("span");
    value.className = "field-value";
    value.textContent = row[field.key] || "—";
    cell.append(label, value);
    grid.append(cell);
  }
  block.append(grid);
  return block;
}
