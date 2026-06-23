import type { AppContext } from "../../app/context";
import type { CsvFileSnapshot } from "../../../../workflows/csv-sync/types";

export function renderCsvWorkspace(app: AppContext): void {
  const { dom, state } = app;
  const { csv } = state;

  dom.csv.summary.hidden = !csv.hasDiscovered;
  dom.csv.empty.style.display = csv.hasDiscovered ? "none" : "block";
  dom.csv.linksCard.style.display = csv.hasDiscovered ? "block" : "none";

  dom.csv.fetchAll.disabled =
    app.state.isBusy || csv.files.length === 0 || csv.files.every((file) => file.status === "loading");
  dom.csv.uploadAll.disabled =
    app.state.isBusy ||
    csv.files.length === 0 ||
    !csv.files.some((file) => Boolean(file.csvText));

  if (csv.hasDiscovered) {
    dom.csv.summary.textContent = buildSummaryText(csv);
  }

  dom.csv.links.innerHTML = "";
  if (csv.files.length === 0 && csv.hasDiscovered) {
    dom.csv.links.appendChild(
      createMutedParagraph("No book_*.csv or follow_*.csv links were found on this page."),
    );
    return;
  }

  for (const file of csv.files) {
    dom.csv.links.appendChild(renderCsvFileCard(app, file));
  }
}

function buildSummaryText(csv: AppContext["state"]["csv"]): string {
  const parts: string[] = [];
  if (csv.crmOrigin) {
    parts.push(`Origin: ${csv.crmOrigin}`);
  }
  parts.push(`${csv.discoveredLinks.length} link(s)`);
  const ready = csv.files.filter((file) => file.status === "ready").length;
  if (ready > 0) {
    parts.push(`${ready} fetched`);
    const rows = csv.files
      .filter((file) => file.parsed)
      .reduce((total, file) => total + (file.parsed?.counts.dataRows ?? 0), 0);
    parts.push(`${rows} parsed data row(s)`);
  }
  if (csv.error) {
    parts.push(csv.error);
  }
  return parts.join(" · ");
}

function renderCsvFileCard(app: AppContext, file: CsvFileSnapshot): HTMLElement {
  const card = document.createElement("details");
  card.className = "table-preview";
  card.open = app.state.csv.openFileIds.has(file.id);
  card.dataset.fileId = file.id;

  const summary = document.createElement("summary");
  summary.className = "table-preview__summary";
  summary.textContent = `${file.label} (${file.csvKind === "booked" ? "Booked" : "Follow Up"})`;

  const meta = document.createElement("span");
  meta.className = "card__title-meta";
  meta.textContent = buildFileMeta(file);
  summary.appendChild(meta);

  const body = document.createElement("div");
  body.className = "table-preview__body";

  body.appendChild(createField("CSV path", file.href));
  if (file.frameUrl) {
    body.appendChild(createField("Discovered in frame", file.frameUrl));
  }

  const actions = document.createElement("div");
  actions.className = "btn-row";

  const fetchBtn = document.createElement("button");
  fetchBtn.type = "button";
  fetchBtn.dataset.csvAction = "fetch";
  fetchBtn.dataset.fileId = file.id;
  fetchBtn.textContent =
    file.status === "loading"
      ? "Fetching…"
      : file.status === "ready"
        ? "Re-fetch CSV"
        : "Fetch CSV";
  fetchBtn.disabled = app.state.isBusy || file.status === "loading";
  actions.appendChild(fetchBtn);

  if (file.csvText) {
    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "btn-secondary";
    uploadBtn.dataset.csvAction = "upload";
    uploadBtn.dataset.fileId = file.id;
    uploadBtn.textContent =
      file.status === "uploading"
        ? "Uploading…"
        : file.status === "uploaded"
          ? "Upload Again"
          : "Upload to S3";
    uploadBtn.disabled = app.state.isBusy || file.status === "uploading";
    actions.appendChild(uploadBtn);

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn-secondary";
    downloadBtn.dataset.csvAction = "download";
    downloadBtn.dataset.fileId = file.id;
    downloadBtn.textContent = "Download .csv";
    downloadBtn.disabled = app.state.isBusy;
    actions.appendChild(downloadBtn);
  }

  body.appendChild(actions);

  if (file.error) {
    body.appendChild(createBanner(file.error));
  }

  if (file.uploadResult) {
    body.appendChild(
      createMutedParagraph(
        `S3 ${file.uploadResult.status}: s3://${file.uploadResult.s3_bucket}/${file.uploadResult.s3_latest_key}`,
      ),
    );
  }

  if (file.parsed) {
    body.appendChild(
      createMutedParagraph(
        `${file.parsed.counts.dataRows} data row(s), ${file.parsed.counts.skippedRows} skipped (totals/blank), ${file.byteLength ?? 0} bytes.`,
      ),
    );
    body.appendChild(renderParsedRowsTable(file));
  }

  card.appendChild(summary);
  card.appendChild(body);
  return card;
}

function buildFileMeta(file: CsvFileSnapshot): string {
  switch (file.status) {
    case "loading":
      return "fetching…";
    case "ready":
      return `${file.parsed?.counts.dataRows ?? 0} rows`;
    case "uploading":
      return "uploading…";
    case "uploaded":
      return file.uploadStatus === "skipped_unchanged"
        ? "unchanged in S3"
        : "uploaded";
    case "error":
      return "failed";
    default:
      return "not fetched";
  }
}

function renderParsedRowsTable(file: CsvFileSnapshot): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "log-tables__body";

  const table = document.createElement("table");
  table.className = "log-grid";

  const headers = file.parsed?.headers ?? [];
  const previewColumns = pickPreviewColumns(headers);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of previewColumns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = file.parsed?.rows ?? [];
  const limit = Math.min(rows.length, 25);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    const tr = document.createElement("tr");
    for (const column of previewColumns) {
      const td = document.createElement("td");
      td.textContent = String(row[column] ?? "");
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);

  if (rows.length > limit) {
    wrapper.appendChild(
      createMutedParagraph(`Showing first ${limit} of ${rows.length} parsed rows.`),
    );
  }

  return wrapper;
}

function pickPreviewColumns(headers: string[]): string[] {
  const preferred = [
    "job_no",
    "ref_no",
    "prior",
    "source",
    "customer",
    "phone",
    "email",
    "from_zip",
    "to_zip",
    "est_cf",
    "estimate",
  ];
  const selected = preferred.filter((column) => headers.includes(column));
  return selected.length > 0 ? selected : headers.slice(0, 8);
}

function createField(label: string, value: string): HTMLElement {
  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(value)}</span>`;
  return field;
}

function createMutedParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "status-text";
  paragraph.style.margin = "0";
  paragraph.textContent = text;
  return paragraph;
}

function createBanner(text: string): HTMLElement {
  const banner = document.createElement("div");
  banner.className = "banner error";
  banner.textContent = text;
  return banner;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
