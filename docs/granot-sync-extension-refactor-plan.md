# Granot Sync Extension Refactor Plan

## Purpose

This plan describes how to refactor `granot_sync_extensions_and_services` without changing the business behavior that the owner depends on today.

The extension currently lets the owner update Vantage leads from Granot CRM in three ways:

- Form Leads table workflow: read Granot `Booked Jobs` and `Follow Up Estimates`, match Vantage form leads by the Granot `ref_no` Mongo id, and update `quoted` plus `cubic_feet`.
- Form Edit Lead workflow: read one Granot edit form lead page and update that form lead's `quoted` value.
- Call Leads workflow: read Granot `Follow Up Estimates` and `Booked Jobs`, preview Vantage matching/update decisions, and sync call lead enrichment or booked call lead reconciliation.

The goal is not to redesign the product first. The goal is to make the current behavior easier to understand, test, and safely extend.

## Current Pain Points

`src/entrypoints/popup/main.ts` is the main refactor target. It is doing too many jobs at once:

- Type definitions for all app data.
- DOM lookup for every element.
- Persistent preference loading/saving.
- Event handler wiring.
- Workspace routing.
- Manual DOM rendering.
- Table scan orchestration.
- API preview orchestration.
- Sync orchestration.
- Auto interval timer management.
- Cycle history management.
- Diagnostics and frame aggregation.
- Detached popup targeting.

The content script is smaller and more focused, but it still mixes message handling, table detection, parsing, normalization, and debug logging in one file.

The API client is mostly clean, but it mixes transport details and endpoint-specific wrappers and does not yet expose a clearly named domain API.

## Refactor Principles

Preserve these behaviors while changing structure:

- Existing direct form lead lookup behavior is preserved first: a valid Granot `ref_no` is still treated as a Vantage Mongo ObjectId.
- Fallback form lead matching should be added deliberately after preview logic is extracted, and should store the resolved Vantage lead id separately from the Granot `ref_no` value.
- Form Leads table sync still maps `prior = 0` to `quoted = false` and `prior = 1` to `quoted = true`.
- Form Leads table sync still updates `cubic_feet` when `est_cf` is numeric.
- Form Leads table sync still parses both `Booked Jobs` and `Follow Up Estimates`.
- Form Edit Lead still supports parsed priority plus quoted true/false override.
- Call Leads matching decisions still come from Vantage preview endpoints, not browser code.
- Manual `Update Booked Call Leads` remains separate from `Sync All Supported` unless intentionally changed.
- Frame-aware parsing must continue to work because Granot can render useful content inside frames.
- The owner-facing copy and statuses should stay stable unless the change is deliberate.

Prefer small extraction steps with tests around each extracted module. Do not rewrite the UI framework and business logic in the same PR.

## Target Architecture

Aim for a structure like this:

```text
src/
  config.ts
  entrypoints/
    background.ts
    granot-crm.content.ts
    popup/
      index.html
      main.ts
      app/
        state.ts
        persistence.ts
        router.ts
        events.ts
        render.ts
      workflows/
        form-leads/
          types.ts
          scan.ts
          preview.ts
          sync.ts
          render.ts
        form-edit-lead/
          types.ts
          scan.ts
          sync.ts
          render.ts
        call-leads/
          types.ts
          scan.ts
          preview.ts
          sync.ts
          render.ts
      auto-sync/
        scheduler.ts
        cycles.ts
      messaging/
        tabs.ts
        diagnostics.ts
      ui/
        components.ts
        dom.ts
        status.ts
  parsers/
    granot/
      common.ts
      form-leads.ts
      form-edit-lead.ts
      call-leads.ts
  utils/
    api.ts
    logger.ts
    page-scraper.ts
```

This is a direction, not a requirement to create every file at once. The best first step is to extract modules that can be tested without touching browser DOM rendering.

## Phase 1: Lock Current Behavior With Characterization Tests

Before moving code, add tests around pure logic and parser behavior.

Recommended tests:

- `intervalMs()` converts seconds, minutes, and hours correctly and clamps/rounds to at least one unit.
- Form lead syncability:
  - valid ObjectId plus prior 0 is syncable and quoted false.
  - valid ObjectId plus prior 1 is syncable and quoted true.
  - missing prior is not syncable.
  - invalid ref_no is not syncable in current behavior, and later becomes fallback-eligible only when phone, email, or customer data is available.
  - prior values other than 0 or 1 are unsupported.
- `buildFormLeadUpdatePayload()` only includes fields that changed.
- `buildFormLeadSyncPayload()` includes target values for idempotent re-assertion.
- Call lead payload mapping preserves `row_id`, `row_index`, `job_no`, `customer`, `phone`, `email`, `from_zip`, `to_zip`, and `est_cf`.
- Booked call reconciliation payload mapping includes `section`, `source`, `prior`, and `book_date`.
- Frame aggregation chooses the first response that found the relevant table/page and reports `frameResponses` plus `frameCount`.
- Content parser fixtures for:
  - Form lead `Booked Jobs` table.
  - Form lead `Follow Up Estimates` table.
  - Current edit lead page with `ORDREF`.
  - Call Leads page with Booked Jobs and Follow Up Estimates sections.

The extension currently only has TypeScript compile script. A practical first test stack would be Vitest plus JSDOM for parser tests.

## Phase 2: Extract Shared Types

Move type definitions out of `popup/main.ts`.

Suggested files:

- `popup/app/state.ts` for `AppState`, `PersistedState`, `WorkspaceId`, `ProgressFilter`, `IntervalUnit`, `CycleEntry`, `CycleDetail`.
- `workflows/form-leads/types.ts` for `FollowUpRow`, `LeadStatus`, `LeadSyncCandidate`, `FormLeadRowPreview`, `CurrentLeadPreview`, `RowSyncResult`, `SyncCounts`.
- `workflows/call-leads/types.ts` for `CallLeadPreviewRow`, `CallLeadPreviewSection`, `CallLeadPreviewResponse`, enrichment preview rows, and booked reconciliation preview rows.

Keep exported names close to today's names. That makes review easier and reduces accidental behavior change.

## Phase 3: Extract Pure Business Logic

Extract logic that does not need DOM or browser APIs.

Good first candidates:

- `intervalMs()`, `formatIntervalLabel()`, `buildCycleSummary()`, and cycle detail builders.
- `isSyncableRow()`, `rowToSyncCandidate()`, `buildFormLeadUpdatePayload()`, `buildFormLeadSyncPayload()`.
- `canSyncCallEnrichmentRow()`, `canSyncBookedCallReconciliationRow()`, `isSyncAllowedCallStatus()`.
- `callLeadRowsToEnrichmentPayloads()`, `callLeadRowsToBookedReconciliationPayloads()`, `getPreviewValue()`.
- `buildFormLeadRowPreview()`.

These should move before render extraction because they are easy to test and reduce the cognitive load inside `main.ts` immediately.

## Phase 4: Extract Granot Parsers From The Content Script

Move parsing logic from `granot-crm.content.ts` into pure parser modules under `src/parsers/granot/`.

Suggested parser modules:

- `common.ts`: `normalizeCellText`, `normalizeHeaderText`, `parseCubicFeet`, header utilities, row utilities.
- `form-leads.ts`: `parseFollowUpRows(root: Document)`.
- `form-edit-lead.ts`: `parseCurrentFormLead(root: Document, pageUrl: string)`.
- `call-leads.ts`: `parseCallLeadTables(root: Document)`.

Keep `granot-crm.content.ts` as a thin adapter:

1. Register message handlers.
2. Call `getSearchDocuments()`.
3. Call the relevant parser.
4. Return the response.
5. Log high-level results.

This is one of the highest value refactors because parser behavior is business-critical and currently hard to test in isolation.

## Phase 5: Extract Messaging And Diagnostics

Move active-tab and frame-aware messaging out of `main.ts`.

Suggested files:

- `popup/messaging/tabs.ts`
  - `getTargetTabId()`
  - `sendActiveTabMessage()`
  - `getTabFrames()`
  - `aggregateFrameResponses()`
  - `matchPatternMatches()`
- `popup/messaging/diagnostics.ts`
  - `runDiagnostics()`
  - `pingFrameWithTimeout()`
  - `summariseDiagnostics()`
  - browser detection helpers

Keep render functions for diagnostics separate from data collection. The diagnostics collector should return a plain `DiagnosticsReport` that can be tested without rendering.

## Phase 6: Extract Workflow Services

Create workflow modules that operate on state and API functions, but do not directly build DOM.

Form Leads workflow module:

- `scanFollowUpTable()`
- `previewFormLeadRows()`
- later, `resolveFormLeadRow()` for id-first plus fallback matching
- `syncRows()`
- `syncLeadCandidates()`

Form Edit Lead workflow module:

- `loadCurrentLeadPreview()`
- `syncCurrentLead()`
- `getCurrentLeadTargetQuoted()`
- `canSyncCurrentLead()`

Call Leads workflow module:

- `scanCallLeadsPreview()`
- `syncCallRows()`
- `syncBookedCallRows()`

At first these functions can still receive a small context object containing:

- `state`
- `setBusy`
- `setStatus`
- `render...` callbacks
- `sendActiveTabMessage`
- `api`

Later, that context can be narrowed once render modules are extracted.

## Phase 7: Extract Auto Sync Scheduler

Move auto interval behavior into `popup/auto-sync/scheduler.ts`.

The scheduler should own:

- Start/stop timer lifecycle.
- Immediate first run after start.
- Busy-skip behavior.
- Per-workspace cycle execution.
- Cycle history push/capping.

Define an explicit interface:

```ts
type AutoSyncWorkflow = {
  id: "form-leads" | "call-leads";
  getIntervalMs(): number;
  setRunning(running: boolean, timerId?: number): void;
  runCycle(): Promise<CycleEntry>;
  render(): void;
};
```

This keeps `setInterval()` mechanics away from Form Leads and Call Leads business rules.

Decision to make during this phase:

- Keep current behavior where Call Leads auto sync only processes Follow Up Estimate enrichment.
- Or intentionally add Booked Jobs auto reconciliation as a separate option.

If Booked Jobs auto reconciliation is added, make it an explicit owner-facing setting, because it broadens what automatic sync can change.

The background implementation should happen after scan/preview/sync logic is reusable outside the popup. The popup can keep manual controls, but `background.ts` should own persisted automated sync settings, alarm scheduling, target-tab validation, and cycle result storage.

## Phase 8: Extract Rendering Components

Only after logic extraction, split rendering.

Suggested modules:

- `popup/ui/components.ts`
  - `fieldBlock`
  - `compactChip`
  - badges
  - `buildLogGrid`
  - `buildTablePreviewAccordion`
  - `buildCycleElement`
- `workflows/form-leads/render.ts`
- `workflows/form-edit-lead/render.ts`
- `workflows/call-leads/render.ts`
- `popup/app/render.ts` for `renderAll()`, `updateGlobalControls()`, and sidebar pulse updates.

This stage may still use manual DOM building. A framework migration is not needed to get the main benefits.

## Phase 9: Improve API Boundary Naming

`utils/api.ts` is functional, but the exported names should make domain ownership obvious.

Recommended shape:

- `api/formLeads.ts`
  - `getFormLeadById`
  - `updateFormLead`
- `api/callLeadEnrichment.ts`
  - `previewCallLeadEnrichment`
  - `syncCallLeadEnrichment`
- `api/bookedCallLeadReconciliation.ts`
  - `previewBookedCallLeadReconciliation`
  - `syncBookedCallLeadReconciliation`
- `api/client.ts`
  - `vantageFetch`
  - `ApiEnvelope`

This can be done with re-export compatibility from `utils/api.ts` at first, then imports can be migrated gradually.

## Phase 10: Security And Configuration Hardening

The current extension requires `VITE_VANTAGE_API_SECRET` for protected `/api/v1` calls. In a built browser extension, that secret is bundled client-side. Treat that as a product/security decision, not just a code detail.

Recommended options to evaluate:

- Keep the secret only for private/internal sideloaded builds and document that it must not be publicly distributed.
- Introduce an operator login/session model for the extension.
- Issue a scoped extension token with limited endpoints and audit logging.
- Add server-side allowlisting/rate limits for extension-originated operations.

Near-term hardening:

- Fail with a clear UI message when `VITE_VANTAGE_API_SECRET` is missing.
- Add API error codes/messages on the server so the extension can distinguish auth failure, validation failure, not found, conflict, and service failure.
- Avoid logging payloads with sensitive customer data outside explicit debug actions.

## Phase 11: Product-Level Improvements After Structure Is Safer

After the modules are smaller and covered by tests, consider these behavior changes:

- Add a separate auto option for Booked Jobs reconciliation.
- Add a dry-run mode for automatic sync where cycles preview but do not PATCH.
- Add "last successful cycle" and "last failed cycle" summary per workspace.
- Persist cycle history optionally in `browser.storage.local` for detached operation logs.
- Add a confirmation prompt before starting automatic sync on production Vantage API base.
- Add row-level retry for failed rows.
- Add an exportable diagnostics bundle for support.

## Feature-Driven Refactor Priorities

The next product features create a practical order for the refactor:

1. Search workspace support needs domain API wrappers and search state that is separate from sync state.
2. Form lead fallback matching needs extracted preview logic so the direct Mongo id path and fallback search path can be tested together.
3. Booking visibility needs normalized preview/result types that consistently expose `has_booking`, `booking_id`, and match method.
4. Background auto-sync needs scan/preview/sync modules that do not depend on popup DOM rendering.
5. Parser hardening needs pure parser modules and fixture tests before header matching or fallback table scoring changes.

Recommended new modules for these features:

```text
src/
  workflows/
    search/
      types.ts
      service.ts
      render.ts
    form-leads/
      resolve.ts
      preview.ts
      sync.ts
    call-leads/
      preview.ts
      sync.ts
  auto-sync/
    settings.ts
    cycles.ts
    background-runner.ts
  api/
    formLeads.ts
    callLeads.ts
    bookings.ts
    cancellations.ts
    customers.ts
    client.ts
```

The search workspace should be added after the API boundary is clearer, but before background automation. It is lower risk than unattended sync and will exercise the new search API wrappers.

## Suggested PR Sequence

1. Add tests and move pure helpers with no behavior change.
2. Extract parser modules and add JSDOM fixtures for Form Leads `Booked Jobs`, Form Leads `Follow Up Estimates`, current edit lead, and Call Leads sections.
3. Extract message/frame aggregation helpers.
4. Split API client by domain while keeping compatibility re-exports.
5. Add search API wrappers and a search workspace.
6. Extract Form Leads scan/preview/sync services.
7. Add form lead fallback preview and then safe fallback sync.
8. Extract Call Leads scan/preview/sync services.
9. Extract auto sync scheduler and cycle utilities.
10. Move automated sync to the background service worker with alarms.
11. Extract render components/workspace render modules.
12. Add security/configuration hardening.

Each PR should compile and preserve the current owner workflow.

## Acceptance Criteria For The Refactor

The refactor is successful when:

- `popup/main.ts` becomes a thin bootstrap file for state, DOM, events, and high-level render orchestration.
- Granot parsers can be tested against fixture HTML without launching a browser extension.
- Auto sync can be tested without real timers by injecting a timer adapter or testing cycle functions directly.
- Form Leads and Call Leads sync workflows can be tested with fake API clients.
- Diagnostics still report frames and content-script responsiveness.
- Manual sync and auto sync still produce the same API calls as before.
- The owner can still use all existing workflows without learning a new UI.

## Highest-Risk Areas

- Parser extraction can accidentally change DOM selection behavior. Use fixtures from real Granot pages before changing it.
- Auto sync extraction can accidentally change timing, immediate-first-run behavior, or busy-skip behavior.
- Frame aggregation can break scans if it stops querying all frames.
- Splitting render code can lose event handlers on dynamically created rows.
- API module splitting can accidentally change request paths or envelope handling.

## First Implementation Step

Start with pure helper extraction from `popup/main.ts`:

- Move interval/cycle helpers into `popup/auto-sync/cycles.ts`.
- Move form lead payload helpers into `workflows/form-leads/sync.ts`.
- Move call lead payload mapping helpers into `workflows/call-leads/payloads.ts`.
- Add tests for those helpers.

This gives immediate value with low risk and creates the pattern for the larger extractions.

After that first extraction, add the search API wrappers and search workspace before background automation. The search work gives the owner immediate value and validates form/call search behavior without introducing unattended writes.
