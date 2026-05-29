// Background auto-sync cycle storage. Persists recent unattended cycles to
// `browser.storage.local` so the popup can show what background automation has
// been doing while it was closed. Keeps the last N cycles per workflow to avoid
// storage bloat. Added in Unit 08 (prepare background auto sync).
import type { ListWorkspaceId } from "../app/state";
import type { CycleDetail } from "./cycles";

export type BackgroundCycleStatus = "ok" | "skipped" | "failed";

export type BackgroundCycle = {
  id: string;
  workflow: ListWorkspaceId;
  status: BackgroundCycleStatus;
  /** ISO timestamps so popup/background can render them in any locale. */
  startedAt: string;
  finishedAt: string;
  message: string;
  targetTabId?: number;
  targetUrl?: string;
  /** Whether this cycle ran in preview-only (dry-run) mode. */
  previewOnly: boolean;
  details: CycleDetail[];
};

export const AUTOMATED_SYNC_CYCLES_KEY = "granot-sync:auto-sync-cycles-v1";
export const MAX_BACKGROUND_CYCLES_PER_WORKFLOW = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Pure: caps the cycle list to `max` entries per workflow, newest first.
 * Cycles are expected to already be ordered newest-first.
 */
export function capCyclesPerWorkflow(
  cycles: BackgroundCycle[],
  max: number,
): BackgroundCycle[] {
  const counts = new Map<ListWorkspaceId, number>();
  const result: BackgroundCycle[] = [];
  for (const cycle of cycles) {
    const seen = counts.get(cycle.workflow) ?? 0;
    if (seen >= max) {
      continue;
    }
    counts.set(cycle.workflow, seen + 1);
    result.push(cycle);
  }
  return result;
}

export async function loadBackgroundCycles(): Promise<BackgroundCycle[]> {
  try {
    const stored = await browser.storage.local.get(AUTOMATED_SYNC_CYCLES_KEY);
    const raw = stored?.[AUTOMATED_SYNC_CYCLES_KEY];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(isRecord) as BackgroundCycle[];
  } catch (err) {
    console.warn("[Granot Sync] Failed to load background cycles:", err);
    return [];
  }
}

/**
 * Prepends a cycle to the stored history, caps per workflow, and persists.
 * Returns the new capped list (newest first).
 */
export async function appendBackgroundCycle(
  cycle: BackgroundCycle,
): Promise<BackgroundCycle[]> {
  const existing = await loadBackgroundCycles();
  const capped = capCyclesPerWorkflow(
    [cycle, ...existing],
    MAX_BACKGROUND_CYCLES_PER_WORKFLOW,
  );
  try {
    await browser.storage.local.set({ [AUTOMATED_SYNC_CYCLES_KEY]: capped });
  } catch (err) {
    console.warn("[Granot Sync] Failed to persist background cycle:", err);
  }
  return capped;
}
