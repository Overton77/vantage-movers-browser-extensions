// Form Lead table parser (Booked Jobs / Follow Up Estimates search results).
// Extracted verbatim from `entrypoints/granot-crm.content.ts` in Unit 03.
import { log } from "../../utils/logger";
import {
  findHeaderRow,
  findTableInSection,
  getColumnValue,
  getOwnTableRows,
  getCellTexts,
  isLeadLikeRow,
  MONGO_OBJECT_ID_RE,
  normalizeCellText,
  parseCubicFeet,
  type FormLeadHeader,
} from "./common";

export type FollowUpRow = {
  id: string;
  rowIndex: number;
  tableSource: "bookedJobs" | "followUpEstimates";
  tableTitle: string;
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

export type ParseResult = {
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

export function parseFormLeadRows(root: Document): ParseResult {
  const sections = [
    {
      key: "bookedJobs" as const,
      title: "Booked Jobs",
      table: findBookedJobsTable(root),
    },
    {
      key: "followUpEstimates" as const,
      title: "Follow Up Estimates",
      table: findFollowUpTable(root),
    },
  ];
  const foundSections = sections.filter(
    (section): section is typeof section & { table: HTMLTableElement } =>
      Boolean(section.table),
  );

  if (foundSections.length === 0) {
    const result = {
      ok: true,
      tableFound: false,
      rows: [],
      counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
    } satisfies ParseResult;
    log("No Booked Jobs or Follow Up Estimates table found:", result);
    return result;
  }

  const rows: FollowUpRow[] = [];
  for (const section of foundSections) {
    const header = findHeaderRow(section.table);
    if (!header) {
      log(`${section.title} table had no usable header`);
      continue;
    }

    rows.push(
      ...readRowsFromTable(section.table, header, {
        tableSource: section.key,
        tableTitle: section.title,
      }),
    );
  }

  const result = {
    ok: true,
    tableFound: true,
    rows,
    counts: countRows(rows),
  } satisfies ParseResult;
  log("Parsed Form Lead rows from Booked Jobs / Follow Up Estimates:", result);
  return result;
}

function findBookedJobsTable(root: ParentNode): HTMLTableElement | undefined {
  return findTableInSection(root, "booked jobs", findHeaderRow);
}

function findFollowUpTable(root: ParentNode): HTMLTableElement | undefined {
  return findTableInSection(root, "follow up estimates", findHeaderRow);
}

function readRowsFromTable(
  table: HTMLTableElement,
  header: FormLeadHeader,
  section: { tableSource: FollowUpRow["tableSource"]; tableTitle: string },
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
    const prior = normalizePriorValue(
      getColumnValue(cells, header.columns.prior),
    );
    const estCf = getColumnValue(cells, header.columns.estCf);
    const baseRow = {
      id: `${section.tableSource}:${rowIndex}:${refNo || jobNo || displayNumber || "row"}`,
      rowIndex,
      tableSource: section.tableSource,
      tableTitle: section.tableTitle,
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

    if (prior !== "0" && prior !== "1" && prior !== "5") {
      rows.push({
        ...baseRow,
        status: "unsupported_prior",
        reason: "Only prior values 0, 1, and 5 are syncable",
      });
      continue;
    }

    rows.push({
      ...baseRow,
      status: "syncable",
      quoted: prior === "1" || prior === "5",
    });
  }

  return rows;
}

function normalizePriorValue(value: string): string {
  const normalized = normalizeCellText(value);
  const match = normalized.match(/^(?:level\s*[-:]?\s*)?(\d+)$/i);
  return match ? match[1] : normalized;
}

function countRows(rows: FollowUpRow[]): ParseResult["counts"] {
  return {
    total: rows.length,
    syncable: rows.filter((row) => row.status === "syncable").length,
    invalid: rows.filter(
      (row) =>
        row.status === "invalid_ref_no" || row.status === "missing_prior",
    ).length,
    unsupported: rows.filter((row) => row.status === "unsupported_prior")
      .length,
  };
}
