export type {
  DiscoverGranotCsvLinksResult,
  FetchGranotCsvResult,
  GranotCsvDataRow,
  GranotCsvKind,
  GranotCsvLink,
  GranotCsvRecord,
  ParsedGranotCsv,
} from "../../parsers/granot/csv-types";

export type CsvFileSnapshot = {
  id: string;
  csvKind: import("../../parsers/granot/csv-types").GranotCsvKind;
  href: string;
  label: string;
  frameUrl?: string;
  status: "idle" | "loading" | "ready" | "uploading" | "uploaded" | "error";
  error?: string;
  fetchedAt?: string;
  uploadedAt?: string;
  uploadStatus?: "uploaded" | "skipped_unchanged";
  uploadResult?: GranotCsvUploadResult;
  csvText?: string;
  byteLength?: number;
  parsed?: import("../../parsers/granot/csv-types").ParsedGranotCsv;
};

export type GranotCsvUploadResult = {
  ingestion_id: string;
  source_id?: string;
  status: "uploaded" | "skipped_unchanged";
  workspace_slug: string;
  csv_kind: import("../../parsers/granot/csv-types").GranotCsvKind;
  content_sha256: string;
  row_count: number;
  data_row_count: number;
  s3_bucket: string;
  s3_latest_key: string;
  s3_history_key?: string;
  s3_meta_key: string;
};
