import { GRANOT_URL_PATTERNS } from "../config";
import { getSearchDocuments, logPageAndTables } from "../utils/page-scraper";
import { error as logError, log } from "../utils/logger";

type FollowUpRow = {
  id: string;
  rowIndex: number;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  estCf?: string;
  cubicFeet?: number;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  status: "syncable" | "invalid_ref_no" | "unsupported_prior" | "missing_prior";
  reason?: string;
};

type CurrentFormLead = {
  id: string;
  refNo: string;
  prior: string;
  priorityLevel: number | undefined;
  quoted?: boolean;
  status: "syncable" | "invalid_ref_no" | "unsupported_prior" | "missing_prior";
  reason?: string;
  pageUrl: string;
};

type ParseResult = {
  ok: true;
  tableFound: boolean;
  rows: FollowUpRow[];
  counts: {
    total: number;
    syncable: number;
    invalid: number;
    unsupported: number;
  };
};

type CurrentFormLeadParseResult = {
  ok: true;
  pageFound: boolean;
  lead?: CurrentFormLead;
};

type CallLeadSectionKey = "bookedJobs" | "followUpEstimates";

type CallLeadPreviewRow = {
  id: string;
  rowIndex: number;
  values: Record<string, string>;
};

type CallLeadPreviewSection = {
  key: CallLeadSectionKey;
  title: string;
  tableFound: boolean;
  headers: string[];
  rows: CallLeadPreviewRow[];
};

type CallLeadPreviewResult = {
  ok: true;
  pageFound: boolean;
  sections: CallLeadPreviewSection[];
};

const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const FIELD_ALIASES = {
  no: ["no"],
  jobNo: ["job_no"],
  source: ["source"],
  refNo: ["ref_no"],
  prior: ["prior"],
  estCf: ["est_cf"],
  customer: ["customer"],
  phone: ["phone"],
  email: ["email"],
} as const;
const CALL_LEAD_SECTIONS = [
  { key: "bookedJobs", title: "Booked Jobs", heading: "booked jobs" },
  {
    key: "followUpEstimates",
    title: "Follow Up Estimates",
    heading: "follow up estimates",
  },
] as const;

export default defineContentScript({
  matches: [...GRANOT_URL_PATTERNS],
  allFrames: true,
  runAt: "document_idle",

  main() {
    const startedAt = new Date().toISOString();
    const manifest = browser.runtime.getManifest();

    log(
      `Content script v${manifest.version} active on`,
      window.location.href,
      "frame is top?",
      window.top === window,
    );

    // Always-on PING handler. Registered FIRST so even if the rest of main()
    // throws, the popup's Diagnose Page can still see this frame answered.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        if (message?.type === "PING") {
          sendResponse(buildPingResponse(manifest, startedAt));
          return true;
        }

        if (message?.type === "DUMP_TABLES") {
          const tables = logPageAndTables();
          sendResponse({ ok: true, tables });
          return true;
        }

        if (message?.type === "PARSE_FOLLOW_UP_ROWS") {
          sendResponse(parseFollowUpRowsFromSearchDocuments());
          return true;
        }

        if (message?.type === "PARSE_CURRENT_FORM_LEAD") {
          sendResponse(parseCurrentFormLeadFromSearchDocuments());
          return true;
        }

        if (message?.type === "PARSE_CALL_LEAD_TABLES") {
          sendResponse(parseCallLeadTablesFromSearchDocuments());
          return true;
        }
      } catch (err) {
        logError("Content script handler crashed for", message, err);
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return true;
      }

      return undefined;
    });

    try {
      // Log once on load, then again after 2s (Granot may render tables late)
      logPageAndTables();
      setTimeout(() => {
        log("Re-scanning page after delay…");
        try {
          logPageAndTables();
        } catch (err) {
          logError("Delayed re-scan failed:", err);
        }
      }, 2000);
    } catch (err) {
      logError("Initial page scan failed:", err);
    }
  },
});

function buildPingResponse(
  manifest: { name: string; version: string; manifest_version?: number },
  startedAt: string,
) {
  const tableCount = document.querySelectorAll("table").length;
  const headings = [...document.querySelectorAll("h1,h2,h3,h4")];
  const hasFollowUpHeading = headings.some((heading) =>
    (heading.textContent ?? "").toLowerCase().includes("follow up estimates"),
  );
  const hasBookedJobsHeading = headings.some((heading) =>
    (heading.textContent ?? "").toLowerCase().includes("booked jobs"),
  );

  return {
    ok: true,
    type: "PING_RESPONSE",
    extensionVersion: manifest.version,
    extensionName: manifest.name,
    runtimeId: browser.runtime.id,
    frameUrl: window.location.href,
    isTopFrame: window.top === window,
    documentReadyState: document.readyState,
    documentTitle: document.title,
    htmlLength: document.documentElement.outerHTML.length,
    tableCount,
    hasFollowUpHeading,
    hasBookedJobsHeading,
    startedAt,
    respondedAt: new Date().toISOString(),
  };
}

function parseCallLeadTablesFromSearchDocuments(): CallLeadPreviewResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseCallLeadTables(searchDocument.document);
    if (result.pageFound) {
      return result;
    }
  }

  const result = {
    ok: true,
    pageFound: false,
    sections: CALL_LEAD_SECTIONS.map((section) => ({
      key: section.key,
      title: section.title,
      tableFound: false,
      headers: [],
      rows: [],
    })),
  } satisfies CallLeadPreviewResult;
  log("No Call Leads / Booked Call Leads tables found in page or accessible frames:", result);
  return result;
}

function parseCallLeadTables(root: Document): CallLeadPreviewResult {
  const sections = CALL_LEAD_SECTIONS.map((section) => {
    const table = findTableInSection(root, section.heading);
    if (!table) {
      return {
        key: section.key,
        title: section.title,
        tableFound: false,
        headers: [],
        rows: [],
      };
    }

    return {
      key: section.key,
      title: section.title,
      tableFound: true,
      ...readPreviewTable(table),
    };
  });
  const result = {
    ok: true,
    pageFound: sections.some((section) => section.tableFound),
    sections,
  } satisfies CallLeadPreviewResult;
  log("Parsed Call Leads / Booked Call Leads tables:", result);
  return result;
}

function parseCurrentFormLeadFromSearchDocuments(): CurrentFormLeadParseResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseCurrentFormLead(searchDocument.document, searchDocument.frameUrl);
    if (result.pageFound) {
      return result;
    }
  }

  const result = { ok: true, pageFound: false } satisfies CurrentFormLeadParseResult;
  log("No current form lead edit page found in page or accessible frames:", result);
  return result;
}

function parseCurrentFormLead(root: Document, pageUrl: string): CurrentFormLeadParseResult {
  const refInput = root.querySelector<HTMLInputElement>('form[name="theForm"] input[name="ORDREF"], input[name="ORDREF"]');
  const looksLikeEditPage = pageUrl.includes("mpcharge~chargeswc") || Boolean(refInput);

  if (!looksLikeEditPage) {
    const result = { ok: true, pageFound: false } satisfies CurrentFormLeadParseResult;
    log("No current form lead edit page found:", result);
    return result;
  }

  const refNo = normalizeCellText(refInput?.value ?? "");
  const priorityLevel = readPriorityLevel(root);
  const prior = typeof priorityLevel === "number" ? String(priorityLevel) : "";
  const baseLead = {
    id: `current:${refNo || "missing-ref"}`,
    refNo,
    prior,
    priorityLevel,
    pageUrl,
  };

  if (!MONGO_OBJECT_ID_RE.test(refNo)) {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "invalid_ref_no",
        reason: "Missing or invalid Mongo ObjectId in ORDREF field",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  if (typeof priorityLevel !== "number") {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "missing_prior",
        reason: "Missing Priority Level on form edit page",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  if (priorityLevel !== 0 && priorityLevel !== 1) {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "unsupported_prior",
        reason: "Only Priority Level 0 and 1 are syncable without override",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  const result = {
    ok: true,
    pageFound: true,
    lead: {
      ...baseLead,
      status: "syncable",
      quoted: priorityLevel === 1,
    },
  } satisfies CurrentFormLeadParseResult;
  log("Parsed current form lead:", result);
  return result;
}

function parseFollowUpRowsFromSearchDocuments(): ParseResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseFollowUpRows(searchDocument.document);
    if (result.tableFound) {
      return result;
    }
  }

  const result = {
    ok: true,
    tableFound: false,
    rows: [],
    counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
  } satisfies ParseResult;
  log("No Follow Up Estimates table found in page or accessible frames:", result);
  return result;
}

function readPriorityLevel(root: ParentNode): number | undefined {
  const priorityLink = root.querySelector<HTMLAnchorElement>('a[href*="fustatuswc"]');
  const priorityContainerText = normalizeCellText(
    priorityLink?.closest("td")?.textContent ?? priorityLink?.parentElement?.textContent ?? "",
  );
  const priorityMatch = priorityContainerText.match(/Level\s*-\s*(\d+)/i);
  if (!priorityMatch) {
    return undefined;
  }

  return Number(priorityMatch[1]);
}

function parseFollowUpRows(root: Document): ParseResult {
  const table = findFollowUpTable(root);
  if (!table) {
    const result = {
      ok: true,
      tableFound: false,
      rows: [],
      counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
    } satisfies ParseResult;
    log("No Follow Up Estimates table found:", result);
    return result;
  }

  const header = findHeaderRow(table);
  if (!header) {
    const result = {
      ok: true,
      tableFound: false,
      rows: [],
      counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
    } satisfies ParseResult;
    log("Follow Up Estimates table had no usable header:", result);
    return result;
  }

  const rows = readRowsFromTable(table, header);
  const result = {
    ok: true,
    tableFound: true,
    rows,
    counts: countRows(rows),
  } satisfies ParseResult;
  log("Parsed Follow Up Estimates rows:", result);
  return result;
}

function findFollowUpTable(root: ParentNode): HTMLTableElement | undefined {
  return findTableInSection(root, "follow up estimates", findHeaderRow);
}

function findTableInSection(
  root: ParentNode,
  headingText: string,
  isUsableTable: (table: HTMLTableElement) => unknown = findPreviewHeaderRow,
): HTMLTableElement | undefined {
  const candidates: Array<{
    tableIndex: number;
    sectionName?: string;
    headerRowIndex?: number;
    firstHeaders: string[];
    rowCount: number;
  }> = [];
  const tables = [...root.querySelectorAll("table")];

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const table = tables[tableIndex];
    const usableTable = isUsableTable(table);
    if (usableTable === undefined || usableTable === false) {
      continue;
    }

    const headerRowIndex =
      typeof usableTable === "number"
        ? usableTable
        : typeof findPreviewHeaderRow(table) === "number"
          ? findPreviewHeaderRow(table)
          : findHeaderRow(table)?.rowIndex;
    const sectionName = getTableSectionName(root, table);
    candidates.push({
      tableIndex,
      sectionName,
      headerRowIndex,
      firstHeaders:
        typeof headerRowIndex === "number"
          ? getCellTexts(getOwnTableRows(table)[headerRowIndex]).slice(0, 8)
          : [],
      rowCount: getOwnTableRows(table).length,
    });

    if (sectionName === headingText) {
      log(`Matched table for section "${headingText}"`, candidates.at(-1));
      return table;
    }
  }

  log(`No table matched section "${headingText}"`, {
    tableCount: tables.length,
    candidates,
    tableSummaries: tables.map((table, tableIndex) =>
      buildDebugTableSummary(table, tableIndex),
    ),
    bodyTextPreview: normalizeCellText(
      (root instanceof Document ? root.body : document.body)?.textContent ?? "",
    ).slice(0, 500),
  });
  return undefined;
}

function buildDebugTableSummary(table: HTMLTableElement, tableIndex: number) {
  const ownRows = getOwnTableRows(table);
  const previewHeaderRow = findPreviewHeaderRow(table);
  const formLeadHeaderRow = findHeaderRow(table)?.rowIndex;

  return {
    tableIndex,
    ownRowCount: ownRows.length,
    allRowCount: table.querySelectorAll("tr").length,
    previewHeaderRow,
    formLeadHeaderRow,
    attributes: {
      id: table.id || undefined,
      className: table.className || undefined,
      width: table.getAttribute("width") || undefined,
      bgcolor: table.getAttribute("bgcolor") || undefined,
      border: table.getAttribute("border") || undefined,
    },
    firstRows: ownRows.slice(0, 4).map((row, rowIndex) => ({
      rowIndex,
      cellCount: row.cells.length,
      cells: getCellTexts(row).slice(0, 12),
    })),
  };
}

function getTableSectionName(
  root: ParentNode,
  table: HTMLTableElement,
): "booked jobs" | "follow up estimates" | undefined {
  const headings = [...root.querySelectorAll("h1,h2,h3,h4")].filter((heading) => {
    const text = normalizeCellText(heading.textContent).toLowerCase();
    return text.includes("follow up estimates") || text.includes("booked jobs");
  });

  const precedingHeading = headings
    .filter((heading) => heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
    .at(-1);

  const headingText = normalizeCellText(precedingHeading?.textContent ?? "").toLowerCase();
  if (headingText.includes("follow up estimates")) {
    return "follow up estimates";
  }
  if (headingText.includes("booked jobs")) {
    return "booked jobs";
  }

  return getSectionNameFromPrecedingText(root, table);
}

function getSectionNameFromPrecedingText(
  root: ParentNode,
  table: HTMLTableElement,
): "booked jobs" | "follow up estimates" | undefined {
  const rootElement =
    root instanceof Document
      ? root.body
      : root instanceof Element
        ? root
        : table.ownerDocument.body;
  if (!rootElement) {
    return undefined;
  }

  try {
    const range = table.ownerDocument.createRange();
    range.selectNodeContents(rootElement);
    range.setEndBefore(table);
    const precedingText = normalizeCellText(range.toString()).toLowerCase();
    range.detach();

    const lastBookedJobs = precedingText.lastIndexOf("booked jobs");
    const lastFollowUpEstimates = precedingText.lastIndexOf("follow up estimates");
    if (lastBookedJobs < 0 && lastFollowUpEstimates < 0) {
      return undefined;
    }

    return lastFollowUpEstimates > lastBookedJobs
      ? "follow up estimates"
      : "booked jobs";
  } catch (err) {
    logError("Could not read preceding text for table section detection:", err);
    return undefined;
  }
}

function readPreviewTable(table: HTMLTableElement): {
  headers: string[];
  rows: CallLeadPreviewRow[];
} {
  const tableRows = getOwnTableRows(table);
  const headerRowIndex = findPreviewHeaderRow(table);
  if (typeof headerRowIndex !== "number") {
    return { headers: [], rows: [] };
  }

  const headers = getCellTexts(tableRows[headerRowIndex]);
  const rows = tableRows
    .slice(headerRowIndex + 1)
    .map((row, offset) => {
      const rowIndex = headerRowIndex + 1 + offset;
      const cells = getCellTexts(row);
      return {
        id: `${rowIndex}:${cells[0] || cells[1] || "row"}`,
        rowIndex,
        values: Object.fromEntries(
          headers.map((header, index) => [
            header || `Column ${index + 1}`,
            cells[index] ?? "",
          ]),
        ),
      };
    })
    .filter((row) => {
      const rowNumber = row.values.no ?? "";
      return /^\d+$/.test(rowNumber) && Boolean(row.values.job_no || row.values.customer);
    });

  return { headers, rows };
}

function findPreviewHeaderRow(table: HTMLTableElement): number | undefined {
  const rows = getOwnTableRows(table);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = [...rows[rowIndex].cells];
    const headers = cells.map((cell) => normalizeHeaderText(cell.textContent ?? ""));
    if (
      cells.some((cell) => cell.tagName.toLowerCase() === "th") &&
      headers.includes("job_no") &&
      headers.includes("customer")
    ) {
      return rowIndex;
    }
  }

  return undefined;
}

function findHeaderRow(table: HTMLTableElement):
  | {
      rowIndex: number;
      columns: Record<keyof typeof FIELD_ALIASES, number>;
    }
  | undefined {
  const rows = getOwnTableRows(table);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headers = getCellTexts(rows[rowIndex]).map(normalizeHeaderText);
    const columns = getHeaderColumns(headers);

    if (columns.refNo >= 0 && columns.prior >= 0) {
      return { rowIndex, columns };
    }
  }

  return undefined;
}

function readRowsFromTable(
  table: HTMLTableElement,
  header: { rowIndex: number; columns: Record<keyof typeof FIELD_ALIASES, number> },
): FollowUpRow[] {
  const rows: FollowUpRow[] = [];
  const tableRows = getOwnTableRows(table);

  for (
    let rowIndex = header.rowIndex + 1;
    rowIndex < tableRows.length;
    rowIndex += 1
  ) {
    const cells = getCellTexts(tableRows[rowIndex]);

    if (cells.every((cell) => !cell)) {
      continue;
    }

    if (!isLeadLikeRow(cells, header.columns)) {
      continue;
    }

    const displayNumber = getColumnValue(cells, header.columns.no);
    const jobNo = getColumnValue(cells, header.columns.jobNo);
    const source = getColumnValue(cells, header.columns.source);
    const refNo = getColumnValue(cells, header.columns.refNo);
    const prior = getColumnValue(cells, header.columns.prior);
    const estCf = getColumnValue(cells, header.columns.estCf);
    const baseRow = {
      id: `${rowIndex}:${refNo || jobNo || displayNumber || "row"}`,
      rowIndex,
      displayNumber,
      jobNo,
      source,
      refNo,
      prior,
      estCf,
      cubicFeet: parseCubicFeet(estCf),
      customer: getColumnValue(cells, header.columns.customer),
      phone: getColumnValue(cells, header.columns.phone),
      email: getColumnValue(cells, header.columns.email),
    };

    if (!prior) {
      rows.push({
        ...baseRow,
        status: "missing_prior",
        reason: "Missing prior value",
      });
      continue;
    }

    if (!MONGO_OBJECT_ID_RE.test(refNo)) {
      rows.push({
        ...baseRow,
        status: "invalid_ref_no",
        reason: "Missing or invalid Mongo ObjectId in ref_no column",
      });
      continue;
    }

    if (prior !== "0" && prior !== "1") {
      rows.push({
        ...baseRow,
        status: "unsupported_prior",
        reason: "Only prior values 0 and 1 are syncable",
      });
      continue;
    }

    rows.push({ ...baseRow, status: "syncable", quoted: prior === "1" });
  }

  return rows;
}

function getOwnTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table,
  );
}

function getCellTexts(row: HTMLTableRowElement): string[] {
  return [...row.cells].map((cell) => normalizeCellText(cell.textContent));
}

function normalizeHeaderText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function normalizeCellText(value: string | null): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeaderColumns(headers: string[]): Record<keyof typeof FIELD_ALIASES, number> {
  return Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => (aliases as readonly string[]).includes(header)),
    ]),
  ) as Record<keyof typeof FIELD_ALIASES, number>;
}

function getColumnValue(cells: string[], column: number): string {
  return column >= 0 ? (cells[column] ?? "") : "";
}

function parseCubicFeet(value: string): number | undefined {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return undefined;
  }

  const cubicFeet = Number(normalized);
  return Number.isFinite(cubicFeet) ? cubicFeet : undefined;
}

function isLeadLikeRow(
  cells: string[],
  columns: Record<keyof typeof FIELD_ALIASES, number>,
): boolean {
  return Boolean(
    getColumnValue(cells, columns.jobNo) ||
      getColumnValue(cells, columns.source) ||
      getColumnValue(cells, columns.refNo) ||
      getColumnValue(cells, columns.prior) ||
      getColumnValue(cells, columns.customer),
  );
}

function countRows(rows: FollowUpRow[]): ParseResult["counts"] {
  return {
    total: rows.length,
    syncable: rows.filter((row) => row.status === "syncable").length,
    invalid: rows.filter((row) => row.status === "invalid_ref_no" || row.status === "missing_prior")
      .length,
    unsupported: rows.filter((row) => row.status === "unsupported_prior").length,
  };
}
