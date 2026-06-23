import { vantageFetch } from "./client";
import type { GranotCsvKind } from "../parsers/granot/csv-types";
import type { GranotCsvUploadResult } from "../workflows/csv-sync/types";

export type UploadGranotCsvPayload = {
  crm_origin: string;
  csv_kind: GranotCsvKind;
  csv_path: string;
  csv_text: string;
  trigger: "extension";
  frame_url?: string;
  fetched_at?: string;
  byte_length?: number;
  row_count?: number;
  data_row_count?: number;
};

export async function uploadGranotCsv(
  payload: UploadGranotCsvPayload,
): Promise<GranotCsvUploadResult> {
  const envelope = await vantageFetch<GranotCsvUploadResult>(
    "/api/v1/granot-crm/csv/uploads",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return envelope.data;
}
