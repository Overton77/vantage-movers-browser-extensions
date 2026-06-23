export type GranotCsvKind = "booked" | "follow_up";

export type GranotCsvLink = {
  csvKind: GranotCsvKind;
  href: string;
  label: string;
  frameUrl: string;
};

export type GranotCsvRecord = Record<string, string>;

export type GranotCsvDataRow = {
  rowIndex: number;
  rowKey: string;
  [column: string]: string | number;
};

export type ParsedGranotCsv = {
  ok: true;
  csvKind?: GranotCsvKind;
  headers: string[];
  rows: GranotCsvDataRow[];
  counts: {
    total: number;
    dataRows: number;
    skippedRows: number;
  };
};

export type FetchGranotCsvResult = ParsedGranotCsv & {
  ok: boolean;
  href: string;
  csvText?: string;
  byteLength?: number;
  error?: string;
  frameUrl?: string;
};

export type DiscoverGranotCsvLinksResult = {
  ok: boolean;
  links: GranotCsvLink[];
  crmOrigin?: string;
  error?: string;
  frameResponses?: number;
  frameCount?: number;
};
