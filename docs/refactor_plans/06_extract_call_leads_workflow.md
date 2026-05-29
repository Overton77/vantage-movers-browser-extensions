# Unit 06: Extract Call Leads Workflow

## Goal

Move Call Leads preview and sync orchestration out of `popup/main.ts` into reusable workflow modules.

## Why This Comes Sixth

Call lead enrichment and booked reconciliation already use server batch endpoints. Extracting these workflows makes them reusable for background automation and keeps future search/booking UI work out of the popup monolith.

## Current State

`popup/main.ts` currently owns:

- `scanCallLeadsPreview()`
- `syncCallRows()`
- `syncBookedCallRows()`
- call lead payload mapping helpers
- call lead syncability checks
- call lead cycle detail builders
- render/status/state mutation during preview and sync

## Proposed Files

Create:

- `src/workflows/call-leads/preview.ts`
- `src/workflows/call-leads/sync.ts`
- `src/workflows/call-leads/cycles.ts`
- `src/workflows/call-leads/index.ts`

Update:

- `src/entrypoints/popup/main.ts`
- tests under `src/workflows/call-leads/*.test.ts`

## Design

Keep call lead workflows server-driven. The extension should not reimplement matching policy.

Workflow input:

- parsed `CallLeadPreviewResponse`
- API functions for enrichment preview/sync
- API functions for booked reconciliation preview/sync

Workflow output:

- enrichment preview rows
- booked reconciliation preview rows
- selected updateable row ids
- sync counts
- row-level results
- cycle details

## Extraction Steps

1. Ensure payload mappers are already moved from Unit 02.
2. Move enrichment preview orchestration into `preview.ts`.
3. Move booked reconciliation preview orchestration into `preview.ts`.
4. Move `syncCallRows()` into `sync.ts`, returning counts and result mapping.
5. Move `syncBookedCallRows()` into `sync.ts`.
6. Move call cycle detail helpers into `cycles.ts`.
7. Keep the popup responsible for status messages and rendering.
8. Add fake API tests.
9. Run `pnpm compile`.
10. Run `pnpm test`.

## Behavior To Preserve

- Scan asks content script for `PARSE_CALL_LEAD_TABLES`.
- Enrichment preview is called for follow-up payloads.
- Booked reconciliation preview is called for booked payloads.
- Selected row ids default to updateable enrichment rows.
- Manual `Sync All Supported` remains separate from `Update Booked Call Leads`.
- Auto-sync still only syncs call lead enrichment until a later explicit setting changes that.

## Tests

Add tests for:

- enrichment payloads are previewed and mapped back by `row_id`
- booked reconciliation payloads are previewed and mapped back by `row_id`
- sync counts updated/unchanged/failed correctly
- booked reconciliation treats `booking_missing`, `no_match`, `invalid`, `conflict`, and `failed` as failed/missing
- cycle details include phone, job number, estimated cubic feet, and changes

## Acceptance Criteria

- Call lead workflow logic is reusable without popup DOM imports.
- Popup code adapts workflow output into state/rendering.
- Manual call lead enrichment still works.
- Manual booked call reconciliation still works.
- Tests cover preview/sync result handling.

## Follow-Up Enabled By This Unit

After this unit, background automation can reuse the same call lead workflow modules and add an explicit owner setting for booked reconciliation.

