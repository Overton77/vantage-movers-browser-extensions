import { log } from './logger';

export type PageContext = {
  url: string;
  title: string;
  timestamp: string;
  htmlLength: number;
};

export type TableRow = {
  rowIndex: number;
  cells: string[];
};

export type TableData = {
  tableIndex: number;
  id?: string;
  className?: string;
  rows: TableRow[];
};

export function getPageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    htmlLength: document.documentElement.outerHTML.length,
  };
}

/** Full page HTML as a string (can be very large). */
export function getPageHtml(): string {
  return document.documentElement.outerHTML;
}

export function scrapeTables(): TableData[] {
  return [...document.querySelectorAll('table')].map((table, tableIndex) => ({
    tableIndex,
    id: table.id || undefined,
    className: table.className || undefined,
    rows: [...table.querySelectorAll('tr')].map((tr, rowIndex) => ({
      rowIndex,
      cells: [...tr.querySelectorAll('td, th')].map(
        (cell) => cell.textContent?.trim() ?? '',
      ),
    })),
  }));
}

export function logPageAndTables(): TableData[] {
  const context = getPageContext();

  log('Page context:', context);
  log('Page HTML preview (first 500 chars):', getPageHtml().slice(0, 500));

  const tables = scrapeTables();
  log(`Found ${tables.length} table(s) on page`);

  for (const table of tables) {
    log(`Table #${table.tableIndex}`, {
      id: table.id,
      className: table.className,
      rowCount: table.rows.length,
    });

    for (const row of table.rows) {
      log(`  tr[${row.rowIndex}]`, row.cells);
    }
  }

  return tables;
}
