// Background auto-sync lock. A best-effort mutex stored in
// `browser.storage.local` that stops overlapping cycles when an alarm fires
// while the previous cycle is still running (e.g. a slow Vantage round-trip).
// A stale lock (older than the timeout, typically left by a torn-down service
// worker) is treated as released. Added in Unit 08.

export const AUTOMATED_SYNC_LOCK_KEY = "granot-sync:auto-sync-lock-v1";
export const LOCK_STALE_MS = 5 * 60 * 1000;

type LockRecord = {
  acquiredAt: number;
};

/** Pure: a lock is considered stale (acquirable) once it passes the timeout. */
export function isLockStale(
  lock: LockRecord | undefined | null,
  now: number,
  staleMs: number = LOCK_STALE_MS,
): boolean {
  if (!lock || typeof lock.acquiredAt !== "number" || Number.isNaN(lock.acquiredAt)) {
    return true;
  }
  return now - lock.acquiredAt >= staleMs;
}

/**
 * Attempts to acquire the lock. Returns true when acquired (no live lock was
 * present), false when another cycle holds a fresh lock.
 */
export async function acquireLock(now: number = Date.now()): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(AUTOMATED_SYNC_LOCK_KEY);
    const current = stored?.[AUTOMATED_SYNC_LOCK_KEY] as
      | LockRecord
      | undefined;
    if (!isLockStale(current, now)) {
      return false;
    }
    await browser.storage.local.set({
      [AUTOMATED_SYNC_LOCK_KEY]: { acquiredAt: now } satisfies LockRecord,
    });
    return true;
  } catch (err) {
    console.warn("[Granot Sync] Failed to acquire auto-sync lock:", err);
    return false;
  }
}

export async function releaseLock(): Promise<void> {
  try {
    await browser.storage.local.remove(AUTOMATED_SYNC_LOCK_KEY);
  } catch (err) {
    console.warn("[Granot Sync] Failed to release auto-sync lock:", err);
  }
}
