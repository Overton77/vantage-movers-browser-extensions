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
  framePath: string;
  frameUrl: string;
  id?: string;
  className?: string;
  rows: TableRow[];
};

type SearchDocument = {
  document: Document;
  framePath: string;
  frameUrl: string;
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

export function getSearchDocuments(rootDocument: Document = document): SearchDocument[] {
  const seen = new Set<Document>();
  const collect = (currentDocument: Document, framePath: string): SearchDocument[] => {
    if (seen.has(currentDocument)) {
      return [];
    }

    seen.add(currentDocument);

    const current: SearchDocument = {
      document: currentDocument,
      framePath,
      frameUrl: currentDocument.location?.href ?? '',
    };

    const childDocuments = [...currentDocument.querySelectorAll('iframe, frame')].flatMap(
      (frame, index) => {
        try {
          const childDocument = (frame as HTMLIFrameElement | HTMLFrameElement).contentDocument;
          return childDocument ? collect(childDocument, `${framePath}.${index}`) : [];
        } catch {
          return [];
        }
      },
    );

    return [current, ...childDocuments];
  };

  return collect(rootDocument, 'top');
}

export function scrapeTables(rootDocument: Document = document): TableData[] {
  return getSearchDocuments(rootDocument).flatMap((searchDocument) =>
    [...searchDocument.document.querySelectorAll('table')].map((table, tableIndex) => ({
      tableIndex,
      framePath: searchDocument.framePath,
      frameUrl: searchDocument.frameUrl,
      id: table.id || undefined,
      className: table.className || undefined,
      rows: [...table.querySelectorAll('tr')].map((tr, rowIndex) => ({
        rowIndex,
        cells: [...tr.querySelectorAll('td, th')].map(
          (cell) => cell.textContent?.trim() ?? '',
        ),
      })),
    })),
  );
}

export function logPageAndTables(): TableData[] {
  const context = getPageContext();

  log('Page context:', context);
  log('Page HTML preview (first 500 chars):', getPageHtml().slice(0, 500));

  const tables = scrapeTables();
  log(`Found ${tables.length} table(s) on page`);

  for (const table of tables) {
    log(`Table #${table.tableIndex}`, {
      framePath: table.framePath,
      frameUrl: table.frameUrl,
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
