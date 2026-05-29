# Granot Sync Extension Code Walkthrough

## Purpose

This document explains how the `granot_sync_extensions_and_services` browser extension works today. It focuses on the popup app state, the automatic interval sync loop, and the full extension runtime path from Granot CRM pages to the protected Vantage API.

The primary source files are:

- `granot_sync_extensions_and_services/src/entrypoints/popup/index.html`
- `granot_sync_extensions_and_services/src/entrypoints/popup/main.ts`
- `granot_sync_extensions_and_services/src/entrypoints/granot-crm.content.ts`
- `granot_sync_extensions_and_services/src/entrypoints/background.ts`
- `granot_sync_extensions_and_services/src/config.ts`
- `granot_sync_extensions_and_services/src/utils/api.ts`
- `granot_sync_extensions_and_services/src/utils/page-scraper.ts`
- `granot_sync_extensions_and_services/wxt.config.ts`

## Runtime Shape

The extension is a WXT TypeScript browser extension named `Granot Sync`. WXT generates the final browser manifest from `wxt.config.ts` and the files under `src/entrypoints`.

The manifest grants:

- `storage`, used by the popup to persist user preferences in `browser.storage.local`.
- `activeTab` and `tabs`, used by the popup to identify and message the active Granot tab.
- `webNavigation`, used by diagnostics and frame-aware messaging to enumerate Granot frames.
- Host permissions for Granot/HelloMoving URLs, localhost, and the Vantage server.

At runtime there are three extension contexts:

1. The popup UI, defined by `popup/index.html` and controlled by `popup/main.ts`.
2. The Granot content script, `granot-crm.content.ts`, injected into matching CRM pages and frames.
3. The background service worker, `background.ts`, which currently only logs startup/install events and acknowledges `GRANOT_PAGE_DATA` messages.

The popup is the real application. It owns state, renders the UI, calls Vantage, starts and stops timers, and sends messages into the active Granot tab. The content script is intentionally narrower: it reads the current Granot DOM, parses tables/pages, and returns structured data to the popup.

## Configuration

`src/config.ts` exports:

- `GRANOT_URL_PATTERNS`: URLs where the content script should run. Current patterns include `eagle.hellomoving.com`, Granot domains, and localhost.
- `VANTAGE_API_BASE`: the base URL for Vantage API calls. It defaults to `https://vantage-movers-main-server.vercel.app`.
- `VANTAGE_API_SECRET`: required for protected `/api/v1` calls. It comes from `VITE_VANTAGE_API_SECRET`.
- `LOG_PREFIX`: the console prefix `[Granot Sync]`.

`src/utils/logger.ts` wraps `console.log`, `console.warn`, and `console.error` with that prefix.

## Popup UI Layout

`popup/index.html` is a single HTML file containing both markup and CSS. It renders:

- A top bar with extension version, connection chip, and a movable window button.
- A left sidebar with workspaces:
  - Form Leads
  - Form Edit Lead
  - Call Leads
  - Diagnose
  - Debug: Log Tables
- A main area containing one section per workspace.
- A bottom status bar with a spinner and latest status/error message.

The popup script gathers all important DOM nodes into the `dom` object near the top of `popup/main.ts`. Each workspace has its own nested DOM group:

- `dom.fl` for Form Leads.
- `dom.cl` for Call Leads.
- `dom.fe` for Form Edit Lead.

The UI does not use a framework. Rendering is manual DOM construction. State changes call render functions such as `renderFormLeads()`, `renderCallLeads()`, `renderFormEditLead()`, or `renderAll()`.

## App State

The root state object in `popup/main.ts` is:

```ts
type AppState = {
  activeWorkspace: WorkspaceId;
  isBusy: boolean;
  formLeads: FormLeadsState;
  callLeads: CallLeadsState;
  formEditLead: FormEditLeadState;
};
```

`state.activeWorkspace` controls which sidebar tab and workspace section are active. `state.isBusy` is a global lock used to disable actions while scans or syncs are running.

### Form Leads State

`state.formLeads` supports the table-based Form Leads workflow for Granot `Follow Up Estimates` rows.

Important fields:

- `parsedRows`: rows parsed from the active Granot page.
- `selectedRowIds`: checked rows for manual bulk sync.
- `previews`: a map from row id to Vantage lookup result. This drives "found - has booking", "found - idempotent", "found - will update", and error badges.
- `openRowIds`: which row accordions are expanded.
- `syncResults`: row-level results from form lead sync.
- `cycles`: automatic ScanAndSync history, newest first.
- `progressFilter`: `all`, `syncable`, or `failed`.
- `intervalValue` and `intervalUnit`: the user's ScanAndSync cadence.
- `autoRunning`, `autoTimerId`, and `autoStartedAt`: timer state.
- `hasScanned`, `logTablesOpen`, and `followUpOpen`: UI state.

Default Form Leads interval is `30 seconds`.

### Call Leads State

`state.callLeads` supports the table-based Call Leads workflow. It tracks both the Granot `Follow Up Estimates` table and the `Booked Jobs` table.

Important fields:

- `preview`: parsed call-lead table sections returned by the content script.
- `enrichmentRows`: Follow Up Estimate payloads plus preview/sync results from Vantage.
- `bookedReconciliationRows`: Booked Jobs payloads plus preview/sync results from Vantage.
- `selectedRowIds`: selected Follow Up Estimate rows for bulk sync.
- `openRowIds`: expanded call-lead row accordions.
- `cycles`: automatic ScanAndSync history for Follow Up Estimate call lead enrichment.
- `progressFilter`: `all`, `syncable`, or `failed`.
- `intervalValue` and `intervalUnit`: the user's ScanAndSync cadence.
- `autoRunning`, `autoTimerId`, and `autoStartedAt`: timer state.
- `hasScanned`, `logTablesOpen`, `followUpOpen`, and `bookedOpen`: UI state.

Default Call Leads interval is `1 minute`.

### Form Edit Lead State

`state.formEditLead` supports a single current Granot edit page.

Important fields:

- `preview`: the parsed current form lead plus current Vantage values.
- `override`: one of `parsed`, `quoted_false`, or `quoted_true`.
- `result`: latest single-lead sync result.

This workflow only syncs the `quoted` value. The edit page does not provide `cubic_feet`.

### Persisted State

Only user preferences are persisted to `browser.storage.local` under `granot-sync:popup-state-v1`.

Persisted fields:

- `activeWorkspace`
- Form Leads interval value/unit and progress filter
- Call Leads interval value/unit and progress filter

Parsed rows, API previews, selected rows, auto timer state, and cycle history are not persisted. They live only for the popup window lifetime.

## Initialization

`main.ts` runs `void init()` immediately.

`init()`:

1. Reads the extension manifest and writes the visible version.
2. Detects whether this popup is a detached movable window.
3. Loads persisted preferences from `browser.storage.local`.
4. Hydrates interval/filter controls from state.
5. Activates the persisted workspace.
6. Attaches all click/change handlers.
7. Renders every workspace.
8. Refreshes the connection chip.
9. Quietly tries to load a current form lead preview.

The popup can run in two modes:

- Normal toolbar popup: it targets the active tab in the current window.
- Detached popup window: `openDetached()` creates a popup window with `?detached=1&targetTabId=<tab id>`, so future messages keep targeting the original Granot tab.

## Popup-To-Content-Script Messaging

The popup sends messages through `sendActiveTabMessage()`.

Frame-aware messages are:

- `DUMP_TABLES`
- `PARSE_FOLLOW_UP_ROWS`
- `PARSE_CURRENT_FORM_LEAD`
- `PARSE_CALL_LEAD_TABLES`

For those messages, the popup calls `browser.webNavigation.getAllFrames()` and sends the same message to each frame id. `aggregateFrameResponses()` then chooses the first frame response that actually found the relevant table/page. This is important because Granot can render useful content inside frames.

Non-aggregated messages are sent directly with `browser.tabs.sendMessage()`.

The content script responds to:

- `PING`: diagnostics heartbeat with frame URL, document state, table count, headings, and extension version.
- `DUMP_TABLES`: raw table dump from `page-scraper.ts`.
- `PARSE_FOLLOW_UP_ROWS`: Form Leads table parsing.
- `PARSE_CURRENT_FORM_LEAD`: current form edit page parsing.
- `PARSE_CALL_LEAD_TABLES`: Call Leads table parsing.

## Content Script Parsing

`granot-crm.content.ts` runs on all configured Granot URL patterns, in all frames, at `document_idle`.

On startup it:

1. Logs extension version, URL, and frame information.
2. Registers the message handler first, so diagnostics still work even if later logic fails.
3. Logs page and table summaries immediately.
4. Logs them again after two seconds because Granot pages can render late.

### Page Search Across Frames

`page-scraper.ts` provides `getSearchDocuments()`, which recursively collects same-origin frame documents when accessible. It also provides raw table scraping for diagnostics and debug logs.

The content script itself also receives messages in each browser frame, and the popup aggregates those responses. This gives the extension two chances to find data:

- The content script can inspect accessible child documents from a given frame.
- The popup can send the same parse request to every frame reported by `webNavigation`.

### Form Leads Table Parsing

`PARSE_FOLLOW_UP_ROWS` calls `parseFollowUpRowsFromSearchDocuments()`.

The parser searches for a table in the `follow up estimates` section. A usable table has a header row with at least `ref_no` and `prior`. Field aliases include:

- `no`
- `job_no`
- `source`
- `ref_no`
- `prior`
- `est_cf`
- `customer`
- `phone`
- `email`

Each data row is normalized into `FollowUpRow`.

Syncability rules:

- `ref_no` must be a 24-character Mongo ObjectId.
- `prior` must be present.
- `prior` must normalize to `0` or `1`.
- `prior = 1` means `quoted = true`.
- `prior = 0` means `quoted = false`.
- `est_cf`, when numeric, becomes `cubicFeet`.

Invalid rows get statuses like `invalid_ref_no`, `missing_prior`, or `unsupported_prior` and are displayed but not synced.

### Current Form Edit Page Parsing

`PARSE_CURRENT_FORM_LEAD` calls `parseCurrentFormLeadFromSearchDocuments()`.

The parser looks for a form lead edit page by checking either:

- URL includes `mpcharge~chargeswc`, or
- the document has an `ORDREF` input.

It reads:

- `ORDREF` as `refNo`, expected to be the Mongo form lead id.
- Priority Level from a link/container matching `fustatuswc`.

Syncability rules are similar to table Form Leads:

- `ORDREF` must be a Mongo ObjectId.
- Priority Level must exist.
- Only Level 0 and Level 1 are syncable without override.

### Call Leads Table Parsing

`PARSE_CALL_LEAD_TABLES` calls `parseCallLeadTablesFromSearchDocuments()`.

The parser looks for two sections:

- `Booked Jobs`
- `Follow Up Estimates`

For each section, it finds a table with `th` headers including `job_no` and `customer`. Rows are converted into `CallLeadPreviewRow` with normalized header keys as object fields. A row is kept when it has a numeric `no` and either `job_no` or `customer`.

The content script does not decide call lead matches. It only extracts CRM table values. Matching and update decisions are delegated to Vantage preview endpoints.

## API Client

`src/utils/api.ts` is the extension's Vantage API client.

All protected calls go through `vantageFetch()`, which:

1. Requires `VITE_VANTAGE_API_SECRET`.
2. Builds the full URL from `VANTAGE_API_BASE`.
3. Sends JSON with `Accept`, `Content-Type`, and `x-api-secret`.
4. Expects an envelope shaped like `{ ok: true, data }` or `{ ok: false, error }`.
5. Throws on non-OK HTTP responses or non-OK envelopes.

Form lead API calls:

- `getFormLeadById(id)`: `GET /api/v1/form-leads/:id`
- `updateFormLead(id, payload)`: `PATCH /api/v1/form-leads/:id`

Call lead API calls:

- `previewCallLeadEnrichment(rows)`: `POST /api/v1/call-leads/enrichment/preview`
- `syncCallLeadEnrichment(rows)`: `POST /api/v1/call-leads/enrichment/sync`
- `previewBookedCallLeadReconciliation(rows)`: `POST /api/v1/call-leads/booked-reconciliation/preview`
- `syncBookedCallLeadReconciliation(rows)`: `POST /api/v1/call-leads/booked-reconciliation/sync`

`pingServer()` still points at `/health` and is largely legacy scaffolding.

## Form Leads Workflow

Manual Form Leads flow:

1. User opens a Granot page with a `Follow Up Estimates` table.
2. User clicks `Scan Follow Up Table`.
3. Popup calls `scanFollowUpTable({ quiet: false })`.
4. Popup sends `PARSE_FOLLOW_UP_ROWS` to all reachable frames.
5. Content script returns parsed rows and counts.
6. Popup stores rows, selects all syncable rows by default, clears old sync results, and renders.
7. Popup starts `previewFormLeadRows()` in parallel.
8. For each syncable row, the popup calls `GET /api/v1/form-leads/:id`.
9. Preview state is stored as `has_booking`, `idempotent`, `will_update`, `not_found`, or `preview_error`.
10. User syncs one row, selected rows, or all supported rows.
11. `syncRows()` maps rows to `LeadSyncCandidate` and calls `syncLeadCandidates()`.
12. `syncLeadCandidates()` gets current Vantage values, computes a minimal patch, and sends `PATCH /api/v1/form-leads/:id`.

The patch can update:

- `quoted`
- `cubic_feet`

If no field differs, the code still sends an idempotent sync payload containing the target values.

## Current Form Edit Lead Workflow

Manual current-lead flow:

1. User opens a Granot edit form lead page.
2. Popup quietly tries to load a preview on startup, or user clicks `Re-scan Current Page`.
3. Popup sends `PARSE_CURRENT_FORM_LEAD`.
4. Content script returns the current `refNo`, `prior`, `priorityLevel`, and syncability status.
5. Popup calls `GET /api/v1/form-leads/:id` to show current Vantage `quoted`, `cubic_feet`, and attached booking id.
6. User can use the parsed priority or override target `quoted` to true/false.
7. `syncCurrentLead()` re-scans first, then calls the same `syncLeadCandidates()` path as table Form Leads.

This workflow is useful when the owner is on one exact Granot edit page and wants a controlled quoted override.

## Call Leads Workflow

Manual Call Leads flow:

1. User opens a Granot Call Leads page with `Follow Up Estimates` and/or `Booked Jobs` sections.
2. User clicks `Scan Call Leads View`.
3. Popup calls `scanCallLeadsPreview({ quiet: false })`.
4. Popup sends `PARSE_CALL_LEAD_TABLES` to all reachable frames.
5. Content script returns parsed sections and rows.
6. Popup converts Follow Up Estimate rows into `CallLeadEnrichmentRowPayload`.
7. Popup converts Booked Jobs rows into `BookedCallLeadReconciliationRowPayload`.
8. Popup calls Vantage preview endpoints for both sets.
9. Preview results tell the popup status, match method, booking state, changes, and warnings.
10. User syncs one row, selected Follow Up Estimate rows, all supported Follow Up Estimate rows, or all updateable Booked Jobs rows.

Follow Up Estimate rows use:

- Preview: `POST /api/v1/call-leads/enrichment/preview`
- Sync: `POST /api/v1/call-leads/enrichment/sync`

Booked Jobs rows use:

- Preview: `POST /api/v1/call-leads/booked-reconciliation/preview`
- Sync: `POST /api/v1/call-leads/booked-reconciliation/sync`

The popup considers call lead rows syncable when preview/sync status is `updateable`, `unchanged`, or `updated`.

The popup displays match methods returned by the server:

- Follow Up enrichment: `phone_and_job_no`, `phone_only`, `job_no_only`, or `none`.
- Booked reconciliation: `job_no_with_booking`, `job_no_only`, `phone_only`, or `none`.

The browser extension does not implement the actual matching rules. It forwards CRM row values and renders the server's decision.

## Auto Interval Sync

The automatic loop is called `ScanAndSync` in the UI and `Auto ScanAndSync` in code. It exists for two list workspaces only:

- `form-leads`
- `call-leads`

It does not run for `form-edit-lead`, `diagnose`, or `debug`.

### Starting The Loop

The start buttons call `startAutoScanAndSync(workflow)`.

That function:

1. Selects either `state.formLeads` or `state.callLeads`.
2. Returns early if that workspace is already running.
3. Calls `stopAutoScanAndSync(workflow)` defensively to clear stale timer state.
4. Converts the interval value/unit into milliseconds with `intervalMs()`.
5. Creates a `window.setInterval()` timer.
6. Sets `autoRunning = true`.
7. Sets `autoStartedAt` to the current time.
8. Re-renders Form Leads and Call Leads.
9. Immediately calls `runAutoScanAndSync(workflow)` once, without waiting for the first interval tick.

While auto sync is running, the workspace hides the manual row list and shows a paused banner. The interval input and unit select are disabled. Sidebar tabs also pulse.

### Stopping The Loop

The stop buttons call `stopAutoScanAndSync(workflow)`.

That function:

1. Clears the `window.setInterval()` timer if `autoTimerId` exists.
2. Sets `autoTimerId` to `undefined`.
3. Sets `autoRunning = false`.
4. Clears `autoStartedAt`.
5. Re-renders Form Leads and Call Leads.

Timer state is not persisted. Closing the popup stops the loop because the popup document and its timers are destroyed.

### Running A Cycle

`runAutoScanAndSync(workflow)` executes one cycle.

First, it checks `state.isBusy`. If another operation is running, it records a failed/skipped cycle with the message `Skipped cycle - another sync is already running.` and returns. This is the main overlap protection.

For `form-leads`, a cycle:

1. Calls `scanFollowUpTable({ quiet: true })`.
2. If scan fails, records a failed cycle.
3. Filters parsed rows into syncable and unsyncable.
4. Calls `syncRows(syncableRows)`.
5. Converts all syncable and unsyncable rows into cycle details.
6. Pushes a cycle summary into `state.formLeads.cycles`.

For `call-leads`, a cycle:

1. Calls `scanCallLeadsPreview({ quiet: true })`.
2. If scan fails, records a failed cycle.
3. Filters `enrichmentRows` into syncable and unsyncable.
4. Calls `syncCallRows(syncableRows.map(row => row.payload))`.
5. Converts the latest enrichment rows into cycle details.
6. Pushes a cycle summary into `state.callLeads.cycles`.

Important limitation: the Call Leads auto loop syncs Follow Up Estimate enrichment rows. It does not currently call `syncBookedCallRows()` for Booked Jobs rows during the automatic cycle, even though manual Booked Jobs sync exists.

### Cycle History

`pushCycle()` creates a `CycleEntry`, prepends it to the workspace cycle list, and caps history at `MAX_CYCLES = 40`.

Cycle details are rendered as accordions. The current progress filter affects which details show inside cycle history:

- `all`: show everything.
- `syncable`: show successful or unchanged details.
- `failed`: show failed details.

### Auto Loop Error Behavior

Individual scan/sync functions catch errors and set status messages. `runAutoScanAndSync()` records failures for scan failures and busy skips, but it has no outer `catch`; it relies on the called functions returning `false` or `undefined`. Because the timer callback uses `void runAutoScanAndSync(...)`, unexpected thrown errors would not stop the interval automatically, but they could be noisy in the console.

## Diagnostics And Debugging

The Diagnose workspace uses `runDiagnostics()`.

It reports:

- Popup URL and whether it is detached.
- Target tab id and active tab URL/title.
- Whether the active tab URL matches `GRANOT_URL_PATTERNS`.
- Browser kind and manifest version.
- All frames returned by `webNavigation.getAllFrames()`.
- A `PING` result or error for each frame.

The Debug workspace uses `runDebugDumpTables()` to send `DUMP_TABLES`, aggregate all frame table dumps, log them to the Granot tab console, and display a short status message.

The Form Leads and Call Leads workspaces each have their own user-friendly `Log Tables` button. These render parsed tables inside the popup and also call `console.table()`.

## Important Current Design Properties

- The popup is the only orchestration layer. Content script parsing is side-effect free except for logs.
- The extension trusts Vantage preview endpoints for call lead matching decisions.
- Form lead matching uses Granot `ref_no` as a Mongo ObjectId.
- Form lead table sync can update both `quoted` and `cubic_feet`.
- Current edit page sync only updates `quoted`.
- Manual row selection is paused visually while auto sync runs.
- Auto sync runs only while the popup or detached popup window remains open.
- Most durable preferences are stored, but operational state is intentionally in memory only.

## Main Risks To Understand Before Changing Code

- `popup/main.ts` combines state types, DOM lookup, event wiring, render functions, parsing orchestration, API orchestration, diagnostics, and timer logic in one large file.
- Auto sync uses `setInterval()` without a persistent background scheduler, so it depends on the popup staying open.
- Call Leads auto sync does not include the manual Booked Jobs reconciliation flow.
- The global `state.isBusy` prevents overlap but also means one workspace can block another.
- Preview and sync code is coupled to DOM rendering state, which makes isolated testing difficult.
- The content script parser depends on Granot table headings and normalized headers; a CRM markup change can break scans.
- `VITE_VANTAGE_API_SECRET` is bundled into the extension build, so distribution and storage of the built extension should be treated carefully.
