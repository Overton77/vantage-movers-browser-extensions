# Unit 05: Extract Form Leads Workflow

## Goal

Move Form Leads scan, preview, and sync orchestration out of `popup/main.ts` into workflow modules that can later support fallback matching and background automation.

## Why This Comes Fifth

Form lead fallback matching and automated sync both depend on reusable workflow code. This unit extracts current behavior first, before adding fallback behavior.

## Current State

`popup/main.ts` currently owns:

- `scanFollowUpTable()`
- `previewFormLeadRows()`
- `buildFormLeadRowPreview()`
- `syncRows()`
- `syncLeadCandidates()`
- form lead cycle detail builders
- form lead render calls and status updates mixed into workflow code

## Proposed Files

Create:

- `src/workflows/form-leads/scan.ts`
- `src/workflows/form-leads/preview.ts`
- `src/workflows/form-leads/sync.ts`
- `src/workflows/form-leads/cycles.ts`
- `src/workflows/form-leads/index.ts`

Update:

- `src/entrypoints/popup/main.ts`
- tests under `src/workflows/form-leads/*.test.ts`

## Design

Workflow modules should receive dependencies instead of importing popup globals.

Example context:

```ts
type FormLeadsWorkflowContext = {
  sendParseMessage: () => Promise<ParseResponse>;
  api: {
    getFormLeadById: typeof getFormLeadById;
    updateFormLead: typeof updateFormLead;
  };
};
```

The popup should remain responsible for:

- mutating popup state
- rendering
- setting user-visible status
- deciding which rows are selected

The workflow should return plain data:

- parsed response
- preview map
- sync counts
- row-level sync results
- cycle detail data

## Extraction Steps

1. Move `previewFormLeadRows()` into `preview.ts`, but make it return a `Map` instead of directly mutating state.
2. Move `syncLeadCandidates()` into `sync.ts`, but make it return row results instead of calling popup callbacks directly.
3. Move `syncRows()` orchestration into `sync.ts` or keep a thin popup wrapper that calls extracted sync functions.
4. Move form lead cycle detail helpers into `cycles.ts`.
5. Move `scanFollowUpTable()` last because it touches status, busy state, render functions, and tab messaging.
6. Add tests with fake API functions.
7. Run `pnpm compile`.
8. Run `pnpm test`.

## Behavior To Preserve

- Scan asks the content script for `PARSE_FOLLOW_UP_ROWS`.
- Both `Booked Jobs` and `Follow Up Estimates` rows are accepted from parser output.
- Selected rows default to `isSyncableRow`.
- Preview uses `GET /api/v1/form-leads/:id` for every syncable row.
- Preview stores row-level `not_found` or `preview_error` without failing the whole preview.
- Sync loops candidates and sends `PATCH` for changed or idempotent supported rows.
- Existing status copy remains stable unless deliberately changed later.

## Tests

Add tests for:

- preview returns `will_update`
- preview returns `idempotent`
- preview returns `has_booking`
- preview returns `not_found` for 404-like errors
- sync updates changed fields
- sync sends idempotent payload when no fields changed
- sync skips missing quoted target
- cycle details include ref_no, quoted, and cubic_feet

## Acceptance Criteria

- Form lead workflow logic is reusable without popup DOM imports.
- `popup/main.ts` is thinner and mostly adapts workflow output into state/rendering.
- Manual Form Leads scan/preview/sync still works.
- Tests cover preview and sync behavior.
- No fallback matching is added in this unit.

## Follow-Up Enabled By This Unit

After this unit, add form lead fallback matching by replacing direct id-only preview with a resolver that can:

1. Try Mongo id.
2. Fall back to search.
3. Return match method and resolved lead id.

