import { uploadGranotCsv } from "../../api/granotCsv";
import type { CsvFileSnapshot, GranotCsvUploadResult } from "./types";

export type CsvUploadOutcome = {
  fileId: string;
  ok: boolean;
  result?: GranotCsvUploadResult;
  error?: string;
};

export async function uploadCsvSnapshots(input: {
  crmOrigin?: string;
  files: CsvFileSnapshot[];
}): Promise<CsvUploadOutcome[]> {
  const crmOrigin = input.crmOrigin?.trim();
  if (!crmOrigin) {
    throw new Error("Missing CRM origin. Discover CSV links before uploading.");
  }

  const outcomes: CsvUploadOutcome[] = [];
  for (const file of input.files) {
    try {
      if (!file.csvText) {
        outcomes.push({
          fileId: file.id,
          ok: false,
          error: "CSV has not been fetched yet.",
        });
        continue;
      }
      const result = await uploadGranotCsv({
        crm_origin: crmOrigin,
        csv_kind: file.csvKind,
        csv_path: file.href,
        csv_text: file.csvText,
        trigger: "extension",
        frame_url: file.frameUrl,
        fetched_at: file.fetchedAt,
        byte_length: file.byteLength,
        row_count: file.parsed?.counts.total,
        data_row_count: file.parsed?.counts.dataRows,
      });
      outcomes.push({ fileId: file.id, ok: true, result });
    } catch (err) {
      outcomes.push({
        fileId: file.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}
