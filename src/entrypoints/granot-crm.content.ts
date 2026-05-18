import { GRANOT_URL_PATTERNS } from "../config";
import { logPageAndTables } from "../utils/page-scraper";
import { log } from "../utils/logger";

type FollowUpRow = {
  id: string;
  rowIndex: number;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  status: "syncable" | "invalid_ref_no" | "unsupported_prior" | "missing_prior";
  reason?: string;
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

const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const FIELD_ALIASES = {
  no: ["no"],
  jobNo: ["job_no"],
  source: ["source"],
  refNo: ["ref_no"],
  prior: ["prior"],
  customer: ["customer"],
  phone: ["phone"],
  email: ["email"],
} as const;

export default defineContentScript({
  matches: [...GRANOT_URL_PATTERNS],
  runAt: "document_idle",

  main() {
    log("Content script active on", window.location.href);

    // Log once on load, then again after 2s (Granot may render tables late)
    logPageAndTables();
    setTimeout(() => {
      log("Re-scanning page after delay…");
      logPageAndTables();
    }, 2000);

    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === "DUMP_TABLES") {
        const tables = logPageAndTables();
        return Promise.resolve({ ok: true, tables });
      }

      if (message?.type === "PARSE_FOLLOW_UP_ROWS") {
        return Promise.resolve(parseFollowUpRows(document));
      }

      return undefined;
    });
  },
});

function parseFollowUpRows(root: ParentNode): ParseResult {
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
  for (const table of [...root.querySelectorAll("table")]) {
    const header = findHeaderRow(table);
    if (!header) {
      continue;
    }

    if (isInFollowUpSection(root, table)) {
      return table;
    }
  }

  return undefined;
}

function isInFollowUpSection(root: ParentNode, table: HTMLTableElement): boolean {
  const headings = [...root.querySelectorAll("h1,h2,h3,h4")].filter((heading) => {
    const text = normalizeCellText(heading.textContent).toLowerCase();
    return text.includes("follow up estimates") || text.includes("booked jobs");
  });

  const precedingHeading = headings
    .filter((heading) => heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
    .at(-1);

  return normalizeCellText(precedingHeading?.textContent ?? "")
    .toLowerCase()
    .includes("follow up estimates");
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
    const baseRow = {
      id: `${rowIndex}:${refNo || jobNo || displayNumber || "row"}`,
      rowIndex,
      displayNumber,
      jobNo,
      source,
      refNo,
      prior,
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
