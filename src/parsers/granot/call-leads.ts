// Call Lead table parser (generic Booked Jobs / Follow Up Estimates preview).
// Extracted verbatim from `entrypoints/granot-crm.content.ts` in Unit 03.
import { log } from "../../utils/logger";
import {
  findPreviewHeaderRow,
  findTableInSection,
  getCellTexts,
  getOwnTableRows,
} from "./common";

export type CallLeadSectionKey = "bookedJobs" | "followUpEstimates";

export type CallLeadPreviewRow = {
  id: string;
  rowIndex: number;
  values: Record<string, string>;
};

export type CallLeadPreviewSection = {
  key: CallLeadSectionKey;
  title: string;
  tableFound: boolean;
  headers: string[];
  rows: CallLeadPreviewRow[];
};

export type CallLeadPreviewResult = {
  ok: true;
  pageFound: boolean;
  sections: CallLeadPreviewSection[];
};

export const CALL_LEAD_SECTIONS = [
  { key: "bookedJobs", title: "Booked Jobs", heading: "booked jobs" },
  {
    key: "followUpEstimates",
    title: "Follow Up Estimates",
    heading: "follow up estimates",
  },
] as const;

export function parseCallLeadTables(root: Document): CallLeadPreviewResult {
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
      return (
        /^\d+$/.test(rowNumber) &&
        Boolean(row.values.job_no || row.values.customer)
      );
    });

  return { headers, rows };
}
