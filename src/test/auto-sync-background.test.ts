import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTOMATED_SYNC_SETTINGS,
  MIN_AUTO_SYNC_INTERVAL_MINUTES,
  normalizeAutomatedSyncSettings,
} from "../auto-sync/settings";
import {
  capCyclesPerWorkflow,
  type BackgroundCycle,
} from "../auto-sync/storage";
import { isLockStale, LOCK_STALE_MS } from "../auto-sync/locks";

describe("normalizeAutomatedSyncSettings", () => {
  it("returns a clone of the defaults for non-object input", () => {
    const result = normalizeAutomatedSyncSettings(undefined);
    expect(result).toEqual(DEFAULT_AUTOMATED_SYNC_SETTINGS);
    expect(result).not.toBe(DEFAULT_AUTOMATED_SYNC_SETTINGS);
    expect(result.workflows).not.toBe(DEFAULT_AUTOMATED_SYNC_SETTINGS.workflows);
  });

  it("keeps valid fields and falls back per-field for invalid ones", () => {
    const result = normalizeAutomatedSyncSettings({
      enabled: true,
      intervalMinutes: 15,
      targetTabId: 42,
      targetWindowId: 7,
      workflows: { formLeads: false, callLeadEnrichment: true },
      safety: { previewOnly: false, allowFallbackFormMatches: "nope" },
    });
    expect(result.enabled).toBe(true);
    expect(result.intervalMinutes).toBe(15);
    expect(result.targetTabId).toBe(42);
    expect(result.targetWindowId).toBe(7);
    expect(result.workflows.formLeads).toBe(false);
    expect(result.workflows.callLeadEnrichment).toBe(true);
    // missing -> default
    expect(result.workflows.bookedCallReconciliation).toBe(false);
    expect(result.safety.previewOnly).toBe(false);
    // invalid type -> default
    expect(result.safety.allowFallbackFormMatches).toBe(false);
  });

  it("clamps and rounds the interval to the minimum", () => {
    expect(normalizeAutomatedSyncSettings({ intervalMinutes: 0 }).intervalMinutes).toBe(
      MIN_AUTO_SYNC_INTERVAL_MINUTES,
    );
    expect(
      normalizeAutomatedSyncSettings({ intervalMinutes: 2.6 }).intervalMinutes,
    ).toBe(3);
  });

  it("drops non-positive / non-integer target ids", () => {
    const result = normalizeAutomatedSyncSettings({
      targetTabId: 0,
      targetWindowId: -3,
    });
    expect(result.targetTabId).toBeUndefined();
    expect(result.targetWindowId).toBeUndefined();
  });
});

function cycle(
  workflow: BackgroundCycle["workflow"],
  id: string,
): BackgroundCycle {
  return {
    id,
    workflow,
    status: "ok",
    startedAt: "",
    finishedAt: "",
    message: "",
    previewOnly: true,
    details: [],
  };
}

describe("capCyclesPerWorkflow", () => {
  it("keeps at most N per workflow, newest first, preserving order", () => {
    const cycles = [
      cycle("form-leads", "f1"),
      cycle("form-leads", "f2"),
      cycle("call-leads", "c1"),
      cycle("form-leads", "f3"),
      cycle("call-leads", "c2"),
    ];
    const capped = capCyclesPerWorkflow(cycles, 2);
    expect(capped.map((c) => c.id)).toEqual(["f1", "f2", "c1", "c2"]);
  });
});

describe("isLockStale", () => {
  it("treats missing or malformed locks as stale", () => {
    expect(isLockStale(undefined, 1000)).toBe(true);
    expect(isLockStale(null, 1000)).toBe(true);
    expect(isLockStale({ acquiredAt: Number.NaN }, 1000)).toBe(true);
  });

  it("treats a fresh lock as live and an old lock as stale", () => {
    const now = 1_000_000;
    expect(isLockStale({ acquiredAt: now - 1000 }, now)).toBe(false);
    expect(isLockStale({ acquiredAt: now - LOCK_STALE_MS }, now)).toBe(true);
  });
});
