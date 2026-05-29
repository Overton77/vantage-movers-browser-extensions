# Unit 02: Extract Shared Types And Pure Helpers

## Goal

Move shared types and pure helper functions out of `src/entrypoints/popup/main.ts` without changing behavior.

## Why This Comes Second

Types and pure helpers are the lowest-risk extraction. They reduce the popup file size and create stable imports for later workflow modules.

## Scope

Move code that does not depend on browser tabs, extension messaging, or DOM rendering.

## Proposed Files

Create:

- `src/workflows/form-leads/types.ts`
- `src/workflows/form-leads/payloads.ts`
- `src/workflows/form-leads/preview-model.ts`
- `src/workflows/call-leads/types.ts`
- `src/workflows/call-leads/payloads.ts`
- `src/auto-sync/cycles.ts`
- `src/app/state.ts`

Update:

- `src/entrypoints/popup/main.ts`

## Extraction Candidates

### Form Leads

Move:

- `FollowUpRow`
- `LeadStatus`
- `LeadSyncCandidate`
- `FormLeadRowPreview`
- `CurrentLeadPreview`
- `RowSyncResult`
- `SyncCounts`
- `isSyncableRow()`
- `rowToSyncCandidate()`
- `buildFormLeadUpdatePayload()`
- `buildFormLeadSyncPayload()`
- `buildUnchangedMessage()`
- `buildUpdatedMessage()`
- `buildFormLeadRowPreview()` if it can stay UI-free

### Call Leads

Move:

- `CallLeadPreviewRow`
- `CallLeadPreviewSection`
- `CallLeadPreviewResponse`
- `CallLeadEnrichmentPreview`
- `BookedCallLeadReconciliationPreview`
- `callLeadRowsToEnrichmentPayloads()`
- `callLeadRowsToBookedReconciliationPayloads()`
- `canSyncCallEnrichmentRow()`
- `canSyncBookedCallReconciliationRow()`

### Auto Sync

Move:

- `CycleEntry`
- `CycleDetail`
- `intervalMs()`
- `formatIntervalLabel()`
- `buildCycleSummary()`
- row-to-cycle-detail builders if they are UI-free

### App State

Move type definitions only:

- `WorkspaceId`
- `ListWorkspaceId`
- `ProgressFilter`
- `IntervalUnit`
- `PersistedState`
- `AppState`

Keep state initialization in `main.ts` until render and event modules are split later.

## Steps

1. Create type modules with exported names matching current local names.
2. Move pure helper functions into domain files.
3. Update imports in `popup/main.ts`.
4. Add or update tests from Unit 01.
5. Keep compatibility simple; do not introduce new abstractions unless a helper already has a clear domain.
6. Run `pnpm compile`.
7. Run `pnpm test`.

## Acceptance Criteria

- `popup/main.ts` loses shared type definitions and pure helper bodies.
- Existing owner workflows compile unchanged.
- Tests cover moved helper behavior.
- No DOM rendering code moves yet.
- No API behavior changes.

## Review Notes

This unit should be mostly move-only. If a diff changes conditionals or messages, split that into a separate behavior PR.

