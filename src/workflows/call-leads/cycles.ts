// Call Leads cycle-detail builder. Turns a call lead enrichment preview (and its
// optional server result) into the UI-free `CycleDetail` used by auto-sync
// history. Kept with the Call Leads workflow so the popup and a background
// runner can share identical cycle bookkeeping.
import type { CycleDetail } from "../../auto-sync/cycles";
import type { CallLeadEnrichmentPreview } from "./types";

export function callEnrichmentRowToCycleDetail(
  row: CallLeadEnrichmentPreview,
): CycleDetail {
  const label = `#${row.payload.row_index ?? row.payload.row_id} ${
    row.payload.customer || "Unknown customer"
  }`;
  const result = row.result;
  const fragments = [
    row.payload.phone ? `phone=${row.payload.phone}` : undefined,
    row.payload.job_no ? `job_no=${row.payload.job_no}` : undefined,
    row.payload.est_cf ? `est_cf=${row.payload.est_cf}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  if (!result) {
    return {
      rowId: row.payload.row_id,
      rowLabel: label,
      status: "skipped",
      message: [fragments, "not syncable"].filter(Boolean).join(" · "),
    };
  }

  const status: CycleDetail["status"] =
    result.status === "updated"
      ? "ok"
      : result.status === "unchanged"
        ? "unchanged"
        : result.status === "failed" || result.status === "conflict"
          ? "failed"
          : "skipped";

  const messageParts = [
    fragments,
    result.message,
    result.changes.length ? `changes: ${result.changes.join(", ")}` : undefined,
  ].filter(Boolean);

  return {
    rowId: row.payload.row_id,
    rowLabel: label,
    status,
    message: messageParts.join(" · "),
  };
}
