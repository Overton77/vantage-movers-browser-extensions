# Unit 03: Extract Granot Parsers

## Goal

Move Granot DOM parsing from the content script into pure parser modules that can be tested with fixture HTML.

## Why This Comes Third

Parser behavior is the highest business risk. It determines what rows can sync. Extracting parsers after tests and shared types gives later feature work a stable foundation for stronger table parsing and fallback matching.

## Current State

`src/entrypoints/granot-crm.content.ts` currently owns:

- message handling
- frame/search document iteration
- form lead table parsing
- current form edit lead parsing
- call lead table parsing
- table/header discovery
- debug logging

This unit should keep the content script as an adapter and move parsing into pure modules.

## Proposed Files

Create:

- `src/parsers/granot/common.ts`
- `src/parsers/granot/form-leads.ts`
- `src/parsers/granot/form-edit-lead.ts`
- `src/parsers/granot/call-leads.ts`
- `src/parsers/granot/debug.ts` if table summaries should remain reusable

Update:

- `src/entrypoints/granot-crm.content.ts`
- parser tests under `src/parsers/granot/*.test.ts`

## Module Responsibilities

### `common.ts`

Move shared parser utilities:

- cell text normalization
- header normalization
- table row helpers
- header row detection primitives
- cubic feet parsing
- ObjectId regex
- field alias lookup

### `form-leads.ts`

Export:

```ts
parseFormLeadRows(root: Document): ParseResult
```

Keep current behavior:

- parse both `Booked Jobs` and `Follow Up Estimates`
- require usable headers
- treat invalid Mongo ids as `invalid_ref_no`
- preserve current `prior` to `quoted` mapping

Do not add fallback matching in this unit.

### `form-edit-lead.ts`

Export:

```ts
parseCurrentFormLead(root: Document, pageUrl: string): CurrentFormLeadParseResult
```

Keep current behavior around `ORDREF` and priority level.

### `call-leads.ts`

Export:

```ts
parseCallLeadTables(root: Document): CallLeadPreviewResult
```

Keep current section parsing and generic table preview behavior.

## Content Script End State

`granot-crm.content.ts` should:

1. Register message listeners.
2. Call `getSearchDocuments()`.
3. Pass each document into the appropriate parser.
4. Return the first parser result that found the expected page/table.
5. Log high-level results.

It should not contain detailed row/header parsing logic.

## Tests

Add parser tests for:

- form lead `Booked Jobs` fixture
- form lead `Follow Up Estimates` fixture
- form lead fixture with invalid `ref_no`
- form edit lead fixture with valid `ORDREF`
- form edit lead fixture with invalid/missing `ORDREF`
- call lead page fixture with both sections
- missing table returns `tableFound: false` or `pageFound: false`

## Steps

1. Create parser modules.
2. Move common helpers first.
3. Move form lead parser and tests.
4. Move form edit parser and tests.
5. Move call lead parser and tests.
6. Thin the content script.
7. Run `pnpm compile`.
8. Run `pnpm test`.
9. Manually scan real Granot pages in dev mode.

## Acceptance Criteria

- Content script behavior is unchanged.
- Parser tests run against fixture HTML.
- `granot-crm.content.ts` is mostly message handling and orchestration.
- Form Leads still parse both `Booked Jobs` and `Follow Up Estimates`.
- No fallback matching behavior is added yet.

## Follow-Up Enabled By This Unit

After this unit, later parser hardening can safely add:

- broader header aliases
- punctuation-insensitive header matching
- fallback table scoring
- fallback-eligible row status for invalid `ref_no`

