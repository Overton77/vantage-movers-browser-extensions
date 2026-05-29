// Auto-sync cycle types + pure helpers (interval math + cycle summaries). The
// row → cycle-detail builders now live with their workflow modules
// (`workflows/form-leads/cycles`, `workflows/call-leads/cycles`) and are
// re-exported here for backward compatibility. These are UI-free so the popup
// and a future background runner can share cycle bookkeeping.
import type { IntervalUnit, ListWorkspaceId } from "../app/state";
import type { SyncCounts } from "../workflows/form-leads/types";

export { followUpRowToCycleDetail } from "../workflows/form-leads/cycles";
export { callEnrichmentRowToCycleDetail } from "../workflows/call-leads/cycles";

export type CycleDetail = {
  rowId: string;
  rowLabel: string;
  status: "ok" | "unchanged" | "failed" | "skipped";
  message: string;
};

export type CycleEntry = {
  id: string;
  workflow: ListWorkspaceId;
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  message: string;
  details: CycleDetail[];
};

export function formatIntervalLabel(value: number, unit: IntervalUnit): string {
  const v = Math.max(1, Math.round(value));
  const singular = v === 1;
  if (unit === "seconds") return `${v}s`;
  if (unit === "minutes") return singular ? `${v} minute` : `${v} minutes`;
  return singular ? `${v} hour` : `${v} hours`;
}

export function intervalMs(value: number, unit: IntervalUnit): number {
  const v = Math.max(1, Math.round(value));
  if (unit === "seconds") return v * 1000;
  if (unit === "minutes") return v * 60 * 1000;
  return v * 60 * 60 * 1000;
}

export function buildCycleSummary(
  label: string,
  syncableCount: number,
  results?: SyncCounts,
): string {
  if (!results) {
    return `${label}: scanned, no supported rows were synced.`;
  }
  return `${label}: ${syncableCount} syncable · ${results.updated} updated · ${results.unchanged} unchanged · ${results.failed} failed.`;
}
