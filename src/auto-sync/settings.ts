// Background auto-sync settings model. Defines the typed settings the owner
// controls, the conservative defaults (disabled, preview-only, Form Leads
// only), and pure normalization + storage helpers. Stored in
// `browser.storage.local` so settings survive popup close and extension reload.
// Added in Unit 08 (prepare background auto sync).

export type AutomatedSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  targetTabId?: number;
  targetWindowId?: number;
  workflows: {
    formLeads: boolean;
    callLeadEnrichment: boolean;
    bookedCallReconciliation: boolean;
  };
  safety: {
    previewOnly: boolean;
    allowFallbackFormMatches: boolean;
  };
};

export const AUTOMATED_SYNC_SETTINGS_KEY = "granot-sync:auto-sync-settings-v1";

/**
 * Chrome's alarms API enforces a one-minute minimum period for unpacked/prod
 * extensions, so the interval is clamped to at least this value.
 */
export const MIN_AUTO_SYNC_INTERVAL_MINUTES = 1;

/**
 * Conservative defaults. Automation is off until the owner enables it, runs in
 * preview-only (dry-run) mode, only targets Form Leads, and never syncs
 * ambiguous fallback form matches. Booked call reconciliation is disabled by
 * default per the Unit 08 safety rules.
 */
export const DEFAULT_AUTOMATED_SYNC_SETTINGS: AutomatedSyncSettings = {
  enabled: false,
  intervalMinutes: 30,
  workflows: {
    formLeads: true,
    callLeadEnrichment: false,
    bookedCallReconciliation: false,
  },
  safety: {
    previewOnly: true,
    allowFallbackFormMatches: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positiveIntOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

/**
 * Pure: merges an untrusted stored/partial settings object onto the defaults,
 * validating each field. Unknown or malformed fields fall back to the default
 * so a corrupt storage entry can never produce an invalid settings object.
 */
export function normalizeAutomatedSyncSettings(
  raw: unknown,
): AutomatedSyncSettings {
  const base = DEFAULT_AUTOMATED_SYNC_SETTINGS;
  if (!isRecord(raw)) {
    return cloneSettings(base);
  }

  const workflows = isRecord(raw.workflows) ? raw.workflows : {};
  const safety = isRecord(raw.safety) ? raw.safety : {};

  const intervalMinutes =
    typeof raw.intervalMinutes === "number" &&
    Number.isFinite(raw.intervalMinutes)
      ? Math.max(MIN_AUTO_SYNC_INTERVAL_MINUTES, Math.round(raw.intervalMinutes))
      : base.intervalMinutes;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    intervalMinutes,
    targetTabId: positiveIntOrUndefined(raw.targetTabId),
    targetWindowId: positiveIntOrUndefined(raw.targetWindowId),
    workflows: {
      formLeads:
        typeof workflows.formLeads === "boolean"
          ? workflows.formLeads
          : base.workflows.formLeads,
      callLeadEnrichment:
        typeof workflows.callLeadEnrichment === "boolean"
          ? workflows.callLeadEnrichment
          : base.workflows.callLeadEnrichment,
      bookedCallReconciliation:
        typeof workflows.bookedCallReconciliation === "boolean"
          ? workflows.bookedCallReconciliation
          : base.workflows.bookedCallReconciliation,
    },
    safety: {
      previewOnly:
        typeof safety.previewOnly === "boolean"
          ? safety.previewOnly
          : base.safety.previewOnly,
      allowFallbackFormMatches:
        typeof safety.allowFallbackFormMatches === "boolean"
          ? safety.allowFallbackFormMatches
          : base.safety.allowFallbackFormMatches,
    },
  };
}

function cloneSettings(settings: AutomatedSyncSettings): AutomatedSyncSettings {
  return {
    ...settings,
    workflows: { ...settings.workflows },
    safety: { ...settings.safety },
  };
}

export async function loadAutomatedSyncSettings(): Promise<AutomatedSyncSettings> {
  try {
    const stored = await browser.storage.local.get(AUTOMATED_SYNC_SETTINGS_KEY);
    return normalizeAutomatedSyncSettings(stored?.[AUTOMATED_SYNC_SETTINGS_KEY]);
  } catch (err) {
    console.warn("[Granot Sync] Failed to load auto-sync settings:", err);
    return cloneSettings(DEFAULT_AUTOMATED_SYNC_SETTINGS);
  }
}

export async function saveAutomatedSyncSettings(
  settings: AutomatedSyncSettings,
): Promise<AutomatedSyncSettings> {
  const normalized = normalizeAutomatedSyncSettings(settings);
  await browser.storage.local.set({
    [AUTOMATED_SYNC_SETTINGS_KEY]: normalized,
  });
  return normalized;
}
