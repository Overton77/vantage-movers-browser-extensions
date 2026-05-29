// Form Leads preview workflow. Resolves each scanned row against Vantage
// (`GET /api/v1/form-leads/:id`) and returns a `Map` of row id → preview model
// describing what running Sync would do. Pure of DOM/state: the popup merges
// the returned map into its own state and renders.
//
// Runs in parallel; per-row failures are captured as `not_found` or
// `preview_error` so one bad row never blocks the rest of the preview.
import type { FormLeadLookup } from "../../utils/api";
import { isSyncableRow } from "./payloads";
import { buildFormLeadRowPreview } from "./preview-model";
import type { FollowUpRow, FormLeadRowPreview } from "./types";

export type FormLeadPreviewContext = {
  getFormLeadById: (id: string) => Promise<FormLeadLookup>;
};

export async function previewFormLeadRows(
  rows: FollowUpRow[],
  context: FormLeadPreviewContext,
): Promise<Map<string, FormLeadRowPreview>> {
  const previews = new Map<string, FormLeadRowPreview>();
  const targets = rows.filter(isSyncableRow);

  await Promise.all(
    targets.map(async (row) => {
      try {
        const current = await context.getFormLeadById(row.refNo);
        previews.set(row.id, buildFormLeadRowPreview(row, current));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const notFound = /not found/i.test(message) || /404/.test(message);
        previews.set(row.id, {
          state: notFound ? "not_found" : "preview_error",
          changes: [],
          message: notFound
            ? "Form lead not found in Vantage — the ref_no may not be a current Mongo ID."
            : `Could not preview against Vantage: ${message}`,
          error: message,
        });
      }
    }),
  );

  return previews;
}
