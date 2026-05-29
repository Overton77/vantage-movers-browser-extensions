// Form Edit Lead workspace rendering. Builds the current-lead card, the
// quoted/cubic_feet diff table, the sync result banner, and the override radio
// group. Extracted from `popup/main.ts` in Unit 07. Target/sync eligibility
// helpers live in the actions module.
import type { OverrideMode } from "../../../../app/state";
import type { AppContext } from "../../app/context";
import { statusBadge } from "../../ui/components";
import { canSyncCurrentLead, getCurrentLeadTargetQuoted } from "./actions";

export function renderFormEditLead(app: AppContext): void {
  renderFormEditLeadContent(app);
  renderFormEditLeadControls(app);
}

function renderFormEditLeadContent(app: AppContext): void {
  const { dom } = app;
  const fe = app.state.formEditLead;
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
  if (fe.preview.currentBooked) {
    const bookingChip = document.createElement("span");
    bookingChip.className = "match-chip is-booking";
    bookingChip.textContent = "has booking";
    leadTitle.append(bookingChip);
  }
  leadCard.append(leadTitle);

  const leadMeta = document.createElement("div");
  leadMeta.className = "row-meta";
  leadMeta.textContent = [
    `ref_no: ${lead.refNo || "missing"}`,
    `Granot prior: ${lead.prior ? `Level-${lead.prior}` : "missing"}`,
    fe.preview.currentBooked
      ? `booking: ${fe.preview.currentBooked} (sync is idempotent on the booking link)`
      : undefined,
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

  const targetQuoted = getCurrentLeadTargetQuoted(app);
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

  const disabled = app.state.isBusy || lead.status === "invalid_ref_no";
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
        renderFormEditLead(app);
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

export function renderFormEditLeadControls(app: AppContext): void {
  const { dom } = app;
  const fe = app.state.formEditLead;
  const isBusy = app.state.isBusy;
  dom.fe.scan.disabled = isBusy;
  dom.fe.sync.disabled = isBusy || !canSyncCurrentLead(app);
  if (!fe.preview) {
    dom.fe.sync.disabled = true;
  }
}
