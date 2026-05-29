// Shared Granot DOM parser utilities. Extracted verbatim from
// `entrypoints/granot-crm.content.ts` in Unit 03 so that parsing logic is pure
// (operates on a passed-in `Document`/`ParentNode`) and can be exercised by
// fixture-based tests without the content-script runtime.
import { error as logError, log } from "../../utils/logger";

export const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export const FIELD_ALIASES = {
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

export type HeaderColumns = Record<keyof typeof FIELD_ALIASES, number>;

export type FormLeadHeader = {
  rowIndex: number;
  columns: HeaderColumns;
};

export function getOwnTableRows(
  table: HTMLTableElement,
): HTMLTableRowElement[] {
  return [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table,
  );
}

export function getCellTexts(row: HTMLTableRowElement): string[] {
  return [...row.cells].map((cell) => normalizeCellText(cell.textContent));
}

export function normalizeHeaderText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

export function normalizeCellText(value: string | null): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getHeaderColumns(headers: string[]): HeaderColumns {
  return Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) =>
        (aliases as readonly string[]).includes(header),
      ),
    ]),
  ) as HeaderColumns;
}

export function getColumnValue(cells: string[], column: number): string {
  return column >= 0 ? (cells[column] ?? "") : "";
}

export function parseCubicFeet(value: string): number | undefined {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return undefined;
  }

  const cubicFeet = Number(normalized);
  return Number.isFinite(cubicFeet) ? cubicFeet : undefined;
}

export function isLeadLikeRow(
  cells: string[],
  columns: HeaderColumns,
): boolean {
  return Boolean(
    getColumnValue(cells, columns.jobNo) ||
    getColumnValue(cells, columns.source) ||
    getColumnValue(cells, columns.refNo) ||
    getColumnValue(cells, columns.prior) ||
    getColumnValue(cells, columns.customer),
  );
}

export function findHeaderRow(table: HTMLTableElement): FormLeadHeader | undefined {
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

export function findPreviewHeaderRow(
  table: HTMLTableElement,
): number | undefined {
  const rows = getOwnTableRows(table);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = [...rows[rowIndex].cells];
    const headers = cells.map((cell) =>
      normalizeHeaderText(cell.textContent ?? ""),
    );
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

export function findTableInSection(
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

export function buildDebugTableSummary(
  table: HTMLTableElement,
  tableIndex: number,
) {
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

export function getTableSectionName(
  root: ParentNode,
  table: HTMLTableElement,
): "booked jobs" | "follow up estimates" | undefined {
  const headings = [...root.querySelectorAll("h1,h2,h3,h4")].filter(
    (heading) => {
      const text = normalizeCellText(heading.textContent).toLowerCase();
      return (
        text.includes("follow up estimates") || text.includes("booked jobs")
      );
    },
  );

  const precedingHeading = headings
    .filter(
      (heading) =>
        heading.compareDocumentPosition(table) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    )
    .at(-1);

  const headingText = normalizeCellText(
    precedingHeading?.textContent ?? "",
  ).toLowerCase();
  if (headingText.includes("follow up estimates")) {
    return "follow up estimates";
  }
  if (headingText.includes("booked jobs")) {
    return "booked jobs";
  }

  return getSectionNameFromPrecedingText(root, table);
}

export function getSectionNameFromPrecedingText(
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
    const lastFollowUpEstimates = precedingText.lastIndexOf(
      "follow up estimates",
    );
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

export function readPriorityLevel(root: ParentNode): number | undefined {
  const priorityLink = root.querySelector<HTMLAnchorElement>(
    'a[href*="fustatuswc"]',
  );
  const priorityContainerText = normalizeCellText(
    priorityLink?.closest("td")?.textContent ??
      priorityLink?.parentElement?.textContent ??
      "",
  );
  const priorityMatch = priorityContainerText.match(/Level\s*-\s*(\d+)/i);
  if (!priorityMatch) {
    return undefined;
  }

  return Number(priorityMatch[1]);
}
