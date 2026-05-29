# Unit 08: Prepare Background Auto Sync

## Goal

Prepare the codebase for background automated sync by adding shared settings/cycle modules and moving scheduler-ready logic away from popup-only timers.

## Why This Comes Last

Background automation introduces unattended writes and depends on all previous extractions. It should only start after parser, API, workflow, and popup shell boundaries are clear.

## Current State

Auto-sync currently lives in `popup/main.ts`:

- `startAutoScanAndSync()`
- `stopAutoScanAndSync()`
- `runAutoScanAndSync()`
- popup `window.setInterval()`
- cycle history stored in popup state

Closing the popup stops automation.

`src/entrypoints/background.ts` is currently a minimal service worker and does not run sync cycles.

## Proposed Files

Create:

- `src/auto-sync/settings.ts`
- `src/auto-sync/cycles.ts`
- `src/auto-sync/storage.ts`
- `src/auto-sync/locks.ts`
- `src/auto-sync/background-runner.ts`
- `src/messaging/tabs.ts` if not already created earlier

Update:

- `src/entrypoints/background.ts`
- `src/entrypoints/popup/main.ts`
- `wxt.config.ts`

## Settings Model

Add a typed settings model:

```ts
type AutomatedSyncSettings = {
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
```

Store it in `browser.storage.local`.

## Cycle Storage

Persist recent background cycles:

- keep last 25 per workflow
- include target tab/url
- include status: `ok`, `skipped`, or `failed`
- include row-level detail when available
- include parser no-table responses as skipped cycles

## Background Runner Responsibilities

The background runner should:

1. Read settings.
2. Check that automation is enabled.
3. Acquire a lock so cycles do not overlap.
4. Resolve the target Granot tab.
5. Send parser messages to content scripts.
6. Call extracted workflow preview/sync modules.
7. Store cycle results.
8. Release the lock.

It should not:

- import popup render modules
- mutate popup state
- directly parse DOM
- silently sync ambiguous fallback matches

## Alarm Scheduling

Add `alarms` to `wxt.config.ts` permissions.

Use a named alarm, for example:

```ts
const AUTO_SYNC_ALARM = "granot-sync:auto-sync";
```

On settings changes:

- if enabled, create/update the alarm
- if disabled, clear the alarm

On browser startup/extension install:

- read settings
- recreate alarm if enabled

## Popup Responsibilities

The popup should:

- display whether background auto-sync is enabled
- let the owner choose the current Granot tab as target
- update settings
- show recent cycle history from storage
- keep manual sync controls available

Popup-only auto-sync can be removed or temporarily kept as a compatibility mode, but the final direction should be background alarms.

## Safety Rules

- Start with `previewOnly` available for dry runs.
- Start with Form Leads only if risk needs to be reduced.
- Keep booked call reconciliation disabled by default.
- Treat missing expected tables as `skipped`, not fatal.
- Treat missing content-script responses as `failed` with reload guidance.
- Never sync ambiguous fallback matches.
- Avoid overlapping cycles.
- Cap stored history to avoid storage bloat.

## Implementation Steps

1. Add settings and storage modules.
2. Add cycle storage helpers.
3. Add a simple background lock.
4. Add alarm permission.
5. Implement background alarm creation/clearing.
6. Implement target tab validation.
7. Implement a preview-only background cycle for Form Leads.
8. Enable write sync after preview-only behavior is verified.
9. Add call lead enrichment.
10. Add booked call reconciliation behind an explicit setting.
11. Update popup UI to control and display background state.

## Acceptance Criteria

- Background settings persist after closing the popup.
- Alarm is recreated after extension reload when enabled.
- Background cycle can find the selected Granot tab.
- Missing/wrong pages produce skipped cycle records.
- No popup DOM/render imports exist in background modules.
- Manual popup workflows still work.
- `pnpm compile` and `pnpm test` pass.

## Feature Work Enabled After This Unit

After this unit, the codebase is ready for:

- real background automated sync
- search workspace implementation
- form lead fallback matching in both manual and automated workflows
- richer booking/cancellation chips in cycle details

