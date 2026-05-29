// Form Leads cycle-detail builder. Turns a scanned row (and its optional sync
// result) into the UI-free `CycleDetail` used by auto-sync history. Kept with
// the rest of the Form Leads workflow so the popup and a background runner can
// share identical cycle bookkeeping.
import type { CycleDetail } from "../../auto-sync/cycles";
import type { FollowUpRow, RowSyncResult } from "./types";

export function followUpRowToCycleDetail(
  row: FollowUpRow,
  result?: RowSyncResult,
): CycleDetail {
  const rowLabel = `#${row.displayNumber || row.rowIndex} ${
    row.customer || "Unknown customer"
  }`;
  const fragments = [
    row.tableTitle ? `table=${row.tableTitle}` : undefined,
    `ref_no=${row.refNo || "missing"}`,
    `quoted=${typeof row.quoted === "boolean" ? row.quoted : "n/a"}`,
    `cubic_feet=${typeof row.cubicFeet === "number" ? row.cubicFeet : "n/a"}`,
  ].filter(Boolean);

  if (result) {
    return {
      rowId: row.id,
      rowLabel,
      status:
        result.status === "updated"
          ? "ok"
          : result.status === "unchanged"
            ? "unchanged"
            : result.status === "failed"
              ? "failed"
              : "skipped",
      message: [fragments.join(", "), result.message].join(" · "),
    };
  }

  return {
    rowId: row.id,
    rowLabel,
    status: "skipped",
    message: [fragments.join(", "), row.reason ?? row.status].join(" · "),
  };
}
