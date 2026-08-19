import type { ExtensionGranotApplyResult, SynchronizationOutcome, UiRowStatus } from "./types";

const UPDATED = new Set<SynchronizationOutcome>(["created", "applied", "linked"]);
const UNCHANGED = new Set<SynchronizationOutcome>(["already_current", "stale"]);

export function mapApplyResultToUiStatus(
  result: ExtensionGranotApplyResult,
): UiRowStatus {
  if (result.processing_state === "accepted_for_processing") {
    return "skipped";
  }
  if (result.outcome && UPDATED.has(result.outcome)) {
    return "updated";
  }
  if (result.outcome && UNCHANGED.has(result.outcome)) {
    return "unchanged";
  }
  return "failed";
}

export function isTerminalApplyResult(result: ExtensionGranotApplyResult): boolean {
  return result.processing_state === "completed";
}

export function mapCallLeadUiStatus(
  result: ExtensionGranotApplyResult,
): "updated" | "unchanged" | "conflict" | "failed" {
  const family = mapApplyResultToUiStatus(result);
  if (family === "updated") return "updated";
  if (family === "unchanged") return "unchanged";
  if (result.outcome === "conflict" || result.outcome === "ambiguous") {
    return "conflict";
  }
  return "failed";
}
