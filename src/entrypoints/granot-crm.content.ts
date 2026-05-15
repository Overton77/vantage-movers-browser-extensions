import { GRANOT_URL_PATTERNS } from "../config";
import { logPageAndTables } from "../utils/page-scraper";
import { error, log, warn } from "../utils/logger";
import { getFormLeadById, updateFormLeadQuoted } from "../utils/api";

type FollowUpRow = {
  rowIndex: number;
  refNo: string;
  prior: string;
  quoted: boolean;
};

type RowFailure = {
  rowIndex: number;
  refNo?: string;
  reason: string;
};

type SyncResult = {
  ok: true;
  tableFound: boolean;
  parsedRows: number;
  updatedRows: number;
  failures: RowFailure[];
};

const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;

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

      if (message?.type === "SYNC_FOLLOW_UP_PRIOR") {
        return syncFollowUpPriorRows();
      }

      return undefined;
    });
  },
});

async function syncFollowUpPriorRows(): Promise<SyncResult> {
  const parsed = parseFollowUpRows(document);
  log("Parsed follow-up prior rows:", parsed);

  if (!parsed.tableFound) {
    warn("Could not find a CRM table with ref_no and prior columns.");
    return {
      ok: true,
      tableFound: false,
      parsedRows: 0,
      updatedRows: 0,
      failures: parsed.failures,
    };
  }

  let updatedRows = 0;
  const failures = [...parsed.failures];

  for (const row of parsed.rows) {
    try {
      await getFormLeadById(row.refNo);
      await updateFormLeadQuoted(row.refNo, row.quoted);
      updatedRows += 1;
      log(`Updated form lead quoted=${row.quoted}`, {
        rowIndex: row.rowIndex,
        refNo: row.refNo,
        prior: row.prior,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({
        rowIndex: row.rowIndex,
        refNo: row.refNo,
        reason: message,
      });
      error("Failed to sync CRM follow-up row; continuing.", {
        rowIndex: row.rowIndex,
        refNo: row.refNo,
        err,
      });
    }
  }

  const result: SyncResult = {
    ok: true,
    tableFound: true,
    parsedRows: parsed.rows.length,
    updatedRows,
    failures,
  };

  log("Follow-up prior sync complete:", result);
  return result;
}

function parseFollowUpRows(root: ParentNode): {
  tableFound: boolean;
  rows: FollowUpRow[];
  failures: RowFailure[];
} {
  for (const table of [...root.querySelectorAll("table")]) {
    const header = findHeaderRow(table);
    if (!header) {
      continue;
    }

    return readRowsFromTable(table, header);
  }

  return {
    tableFound: false,
    rows: [],
    failures: [],
  };
}

function findHeaderRow(table: HTMLTableElement):
  | {
      rowIndex: number;
      refNoColumn: number;
      priorColumn: number;
    }
  | undefined {
  const rows = getOwnTableRows(table);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headers = getCellTexts(rows[rowIndex]).map((value) =>
      value.toLowerCase(),
    );
    const refNoColumn = headers.indexOf("ref_no");
    const priorColumn = headers.indexOf("prior");

    if (refNoColumn >= 0 && priorColumn >= 0) {
      return { rowIndex, refNoColumn, priorColumn };
    }
  }

  return undefined;
}

function readRowsFromTable(
  table: HTMLTableElement,
  header: { rowIndex: number; refNoColumn: number; priorColumn: number },
) {
  const rows: FollowUpRow[] = [];
  const failures: RowFailure[] = [];
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

    const refNo = cells[header.refNoColumn] ?? "";
    const prior = cells[header.priorColumn] ?? "";

    if (!MONGO_OBJECT_ID_RE.test(refNo)) {
      failures.push({
        rowIndex,
        refNo: refNo || undefined,
        reason: "Missing or invalid Mongo ObjectId in ref_no column",
      });
      continue;
    }

    if (!prior) {
      failures.push({
        rowIndex,
        refNo,
        reason: "Missing prior value",
      });
      continue;
    }

    rows.push({
      rowIndex,
      refNo,
      prior,
      quoted: prior !== "0",
    });
  }

  return {
    tableFound: true,
    rows,
    failures,
  };
}

function getOwnTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table,
  );
}

function getCellTexts(row: HTMLTableRowElement): string[] {
  return [...row.cells].map((cell) => normalizeCellText(cell.textContent));
}

function normalizeCellText(value: string | null): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
