// Search workspace rendering. Hydrates the filter inputs from state, reflects
// the active lead-type tab, and builds compact read-only result cards with
// booking / cancellation chips. Pure render: all data lives in state.search.
import type {
  CallLeadCard,
  FormLeadCard,
  LeadBookingSummary,
  LeadCancellationSummary,
} from "../../../../utils/api";
import type { AppContext } from "../../app/context";
import { compactChip, fieldBlock } from "../../ui/components";

export function renderSearch(app: AppContext): void {
  renderSearchControls(app);
  renderSearchResults(app);
}

function renderSearchControls(app: AppContext): void {
  const { dom, state } = app;
  const sr = state.search;
  const busy = state.isBusy;

  // Reflect active entity tab using primary vs secondary button styling.
  const isForm = sr.entity === "form-leads";
  dom.search.entityFormLeads.classList.toggle("btn-secondary", !isForm);
  dom.search.entityCallLeads.classList.toggle("btn-secondary", isForm);

  // Hydrate inputs from state (so persisted/cleared values are reflected).
  if (dom.search.q.value !== sr.query.q) dom.search.q.value = sr.query.q;
  if (dom.search.sourceCompany.value !== sr.query.source_company) {
    dom.search.sourceCompany.value = sr.query.source_company;
  }
  if (dom.search.name.value !== sr.query.name) {
    dom.search.name.value = sr.query.name;
  }
  if (dom.search.email.value !== sr.query.email) {
    dom.search.email.value = sr.query.email;
  }
  if (dom.search.phone.value !== sr.query.phone_number) {
    dom.search.phone.value = sr.query.phone_number;
  }

  dom.search.entityFormLeads.disabled = busy;
  dom.search.entityCallLeads.disabled = busy;
  dom.search.run.disabled = busy;
  dom.search.clear.disabled = busy;
}

function renderSearchResults(app: AppContext): void {
  const { dom, state } = app;
  const sr = state.search;

  dom.search.results.textContent = "";

  // Summary line.
  if (sr.error) {
    dom.search.summary.hidden = false;
    dom.search.summary.textContent = `Search failed: ${sr.error}`;
  } else if (sr.hasSearched) {
    const shown =
      sr.entity === "form-leads" ? sr.formResults.length : sr.callResults.length;
    const label = sr.entity === "form-leads" ? "form lead" : "call lead";
    dom.search.summary.hidden = false;
    dom.search.summary.textContent = `${sr.count} ${label}(s) matched; showing ${shown}.`;
  } else {
    dom.search.summary.hidden = true;
    dom.search.summary.textContent = "";
  }

  const cards =
    sr.entity === "form-leads"
      ? sr.formResults.map((lead) => buildFormLeadCard(lead))
      : sr.callResults.map((lead) => buildCallLeadCard(lead));

  if (cards.length === 0) {
    dom.search.empty.style.display = "block";
    dom.search.empty.innerHTML = sr.loading
      ? "<strong>Searching…</strong>Querying Vantage."
      : sr.hasSearched
        ? "<strong>No matches</strong>No leads matched these filters. Try fewer or broader filters."
        : "<strong>No search yet</strong>Pick a lead type, set any filters, and click Search. Leave filters blank to list the latest leads.";
    return;
  }

  dom.search.empty.style.display = "none";
  for (const card of cards) {
    dom.search.results.append(card);
  }
}

function buildFormLeadCard(lead: FormLeadCard): HTMLDivElement {
  const chips: HTMLSpanElement[] = [];
  const sourceDisplay = sourceDisplayLabel(lead);
  if (lead.ref_no) chips.push(compactChip("ref_no", lead.ref_no));
  if (typeof lead.quoted === "boolean") {
    chips.push(compactChip("quoted", String(lead.quoted)));
  }
  if (typeof lead.cubic_feet === "number") {
    chips.push(compactChip("cubic_feet", String(lead.cubic_feet)));
  }

  return buildLeadCard({
    kind: "Form Lead",
    id: lead._id,
    name: lead.name,
    source_company: sourceDisplay,
    chips,
    fields: {
      phone: lead.phone_number ?? "",
      email: lead.email ?? "",
      source: sourceDisplay,
      source_company: lead.source_company ?? "",
      source_granularity_key: lead.source_granularity_key ?? "",
      ref_no: lead.ref_no ?? "",
      receiver_agent: lead.receiver_agent_name_snapshot ?? "",
      receiver_crm_username: lead.receiver_agent_granot_crm_username ?? "",
      created: formatDate(lead.createdAt),
    },
    booked: lead.booked,
    cancelled: lead.cancelled,
  });
}

function buildCallLeadCard(lead: CallLeadCard): HTMLDivElement {
  const chips: HTMLSpanElement[] = [];
  const sourceDisplay = sourceDisplayLabel(lead);
  if (lead.job_no) chips.push(compactChip("job_no", lead.job_no));
  if (typeof lead.cubic_feet === "number") {
    chips.push(compactChip("cubic_feet", String(lead.cubic_feet)));
  }

  return buildLeadCard({
    kind: "Call Lead",
    id: lead._id,
    name: lead.name,
    source_company: sourceDisplay,
    chips,
    fields: {
      phone: lead.phone_number ?? "",
      email: lead.email ?? "",
      source: sourceDisplay,
      source_company: lead.source_company ?? "",
      source_granularity_key: lead.source_granularity_key ?? "",
      job_no: lead.job_no ?? "",
      receiver_agent: lead.receiver_agent_name_snapshot ?? "",
      receiver_crm_username: lead.receiver_agent_granot_crm_username ?? "",
      created: formatDate(lead.createdAt),
    },
    booked: lead.booked,
    cancelled: lead.cancelled,
  });
}

type LeadCardModel = {
  kind: string;
  id: string;
  name?: string;
  source_company?: string;
  chips: HTMLSpanElement[];
  fields: Record<string, string>;
  booked: LeadBookingSummary | null;
  cancelled: LeadCancellationSummary | null;
};

function buildLeadCard(model: LeadCardModel): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "row";

  const header = document.createElement("div");
  header.className = "row-compact";

  const title = document.createElement("span");
  title.className = "row-title";
  title.textContent = `${model.kind} · ${model.name || "Unknown customer"}`;
  header.append(title);

  for (const chip of model.chips) {
    header.append(chip);
  }
  header.append(buildBookingBadge(model.booked, model.cancelled));
  card.append(header);

  const body = document.createElement("div");
  body.className = "row__body";

  const grid = document.createElement("div");
  grid.className = "field-grid";
  grid.append(fieldBlock("vantage_id", model.id));
  for (const [label, value] of Object.entries(model.fields)) {
    grid.append(fieldBlock(label, value || "blank"));
  }
  if (model.booked) {
    grid.append(fieldBlock("booking_id", model.booked._id));
    if (model.booked.job_no) {
      grid.append(fieldBlock("booking_job_no", model.booked.job_no));
    }
    if (model.booked.book_date) {
      grid.append(fieldBlock("book_date", formatDate(model.booked.book_date)));
    }
  }
  if (model.cancelled) {
    grid.append(fieldBlock("cancellation_id", model.cancelled._id));
    if (model.cancelled.cancel_date) {
      grid.append(
        fieldBlock("cancel_date", formatDate(model.cancelled.cancel_date)),
      );
    }
  }
  body.append(grid);
  card.append(body);

  return card;
}

function buildBookingBadge(
  booked: LeadBookingSummary | null,
  cancelled: LeadCancellationSummary | null,
): HTMLSpanElement {
  const badge = document.createElement("span");
  if (cancelled) {
    badge.className = "badge error";
    badge.textContent = "cancelled";
  } else if (booked) {
    badge.className = "badge ok";
    badge.textContent = booked.job_no ? `booked · ${booked.job_no}` : "booked";
  } else {
    badge.className = "badge muted";
    badge.textContent = "no booking";
  }
  return badge;
}

function formatDate(value?: string | Date): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function sourceDisplayLabel(lead: FormLeadCard | CallLeadCard): string {
  return (
    lead.crm_source_label_snapshot ||
    lead.source_granularity_label_snapshot ||
    lead.source_company_label_snapshot ||
    lead.source_company ||
    ""
  );
}
