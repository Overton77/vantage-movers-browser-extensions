# Granot Lead Matching Messaging UX Refactor Spec

## Purpose

Improve the owner-facing messaging in the Granot browser extension for matching, enriching, and syncing Form Leads and Call Leads from the Granot CRM Follow Up Estimates and Booked Jobs tables.

The refactor should keep the extension in plain TypeScript and DOM builders. Do not introduce React for this pass. The goal is not a framework migration; the goal is a clear messaging model with a small interface that the existing render files can use consistently.

## Current Problems

The current scan summary and row summaries compress several different facts into one line. This creates misleading messages such as:

```text
117 parsed row(s): 34 syncable, 0 unsupported prior, 117 invalid. 0 selected. Vantage preview: 115 found by fallback, 2 not found.
```

The word `invalid` is especially misleading because many of those rows may still be useful after fallback matching. `unsupported prior` is also unclear because it describes parser/sync eligibility, not backend state.

Per-row messaging has the same problem. A row can say `fallback`, `idempotent`, `has booking`, `invalid ref_no`, and then include a long server/preview paragraph. These facts are true in isolation, but the owner cannot quickly answer the important questions:

- Did Vantage find the lead?
- How was it matched?
- Is there a booking attached?
- Will sync change anything?
- Did sync already run, and what happened?
- Is the Sales Rep linked, already linked, or unmatched?

## Constraints From The Codebase

- Popup rendering is currently imperative DOM code in `src/entrypoints/popup/workspaces/*/render.ts` and shared DOM primitives in `src/entrypoints/popup/ui/components.ts`.
- Preserve the existing workflow outcome vocabulary. Do not rename status enums such as `syncable`, `invalid_ref_no`, `updateable`, `unchanged`, `updated`, `no_match`, `conflict`, `has_booking`, or `found_by_fallback`.
- Call lead preview/sync messages are server-authored by the Vantage API. The extension should present those messages clearly, but it should not reimplement matching policy.
- For call leads, the Granot `phone` payload is match-only and must not be described as a synced phone update.
- Form lead sync is unusual: an `unchanged` form row still sends a PATCH so Vantage can run its sheet-sync path. Call lead `unchanged` usually means no DB write unless receiver-agent attribution is added.
- Scan results are ephemeral popup state; do not persist row preview/sync state in `granot-sync:popup-state-v1`.

## Files To Touch

Primary extension files:

- `src/entrypoints/popup/workspaces/form-leads/render.ts`
- `src/entrypoints/popup/workspaces/call-leads/render.ts`
- `src/entrypoints/popup/ui/components.ts`
- `src/entrypoints/popup/index.html`

Recommended new formatter module:

- `src/entrypoints/popup/ui/leadMessaging.ts`

Optional workflow copy cleanup:

- `src/workflows/form-leads/preview-model.ts`
- `src/workflows/form-leads/sync.ts`
- `src/workflows/form-leads/cycles.ts`
- `src/workflows/call-leads/cycles.ts`

Server files are reference points, not primary edit targets for this UI pass:

- `vantage-main-server/api/services/enrichment/callLeadEnrichment.service.ts`
- `vantage-main-server/api/services/reconciliation/bookedCallLeadReconciliation.service.ts`
- `vantage-main-server/api/services/search/formLeadSearch.service.ts`
- `vantage-main-server/api/services/agents/receiverAgentCrmUsername.ts`

## Proposed Module Shape

Add a UI-free formatter module at `src/entrypoints/popup/ui/leadMessaging.ts`. It should accept existing row, preview, and sync-result data and return plain display models. Render files should create DOM from these models.

Suggested interface:

```ts
export type SummaryMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "bad";
  help?: string;
};

export type RowStatusCard = {
  title: string;
  tone: "neutral" | "good" | "warn" | "bad";
  lines: string[];
  chips: Array<{ label: string; value: string; tone?: SummaryMetric["tone"] }>;
};
```

Suggested formatter functions:

- `buildFormLeadScanMetrics(state): SummaryMetric[]`
- `buildCallLeadScanMetrics(state): SummaryMetric[]`
- `buildFormLeadCollapsedModel(row, preview, result, syncable): RowStatusCard`
- `buildCallLeadCollapsedModel(row, workflow, result, canSync): RowStatusCard`
- `buildFormLeadExpandedSummary(row, preview, result): RowStatusCard`
- `buildCallLeadExpandedSummary(row, workflow, result): RowStatusCard`
- `formatMatchMethod(method): string`
- `formatSyncOutcome(status, changes): string`
- `formatSalesRepState(rawValue, linkedName, warnings): string`

Keep this module pure: no DOM, no app context, no side effects. That gives the render files one small interface and keeps the copy testable.

## Scan Summary UX

Replace the single-line summary text with a compact vertical metric card. This can still live inside the existing `.summary` element.

### Form Leads Summary

Show these metrics:

- `Parsed Rows`: total parsed Granot rows.
- `Matched In Vantage`: rows with a resolved Vantage lead by `ref_no` or fallback.
- `Not Found`: rows with `not_found`.
- `Needs Review`: conflicts, preview errors, missing prior, unsupported prior, invalid rows that could not resolve by fallback.
- `Syncable`: rows currently allowed by `isRowSyncable`.
- `Selected`: selected syncable rows.

Do not show raw `invalid` as a headline metric. If needed, show it as `Needs Fallback / Review`, with copy that explains the Granot `ref_no` was not a valid/current Vantage id.

Suggested rendered copy:

```text
Parsed Rows: 117
Matched In Vantage: 115
Not Found: 2
Needs Review: 0
Syncable: 34
Selected: 0
```

If fallback was used, add a small secondary line:

```text
Fallback Matches: 115 matched by phone and email after ref_no did not resolve.
```

### Call Leads Summary

Show separate Follow Up Estimates and Booked Jobs counts, but keep the owner-facing facts simple:

```text
Tables Found: 2
Follow Up Rows: 83
Booked Job Rows: 34
Matched In Vantage: 115
Not Found: 2
Syncable: 34
Selected: 0
```

Optional details may be shown as secondary chips:

- `Matched By Phone`
- `Matched By Job No`
- `Matched Through Booking`
- `Has Booking`

Avoid `updateable by job/phone/source` in table summaries. It is technically useful but hard to parse. Prefer `Syncable` in the visible headline and keep the matching method on rows.

## Collapsed Row UX

The collapsed row must answer the owner’s top questions without requiring expansion.

### Required Visible Facts

For Booked Jobs and Follow Up Estimates rows, show:

- Table name and row number.
- Customer name.
- `job_no`, if present.
- `cubic_feet` or `est_cf`, if present.
- `prior`, if present.
- Match state: `Matched by ref_no`, `Matched by phone + email`, `Matched by phone`, `Matched by job_no`, `Matched through booking`, or `Not found`.
- Sync state: `Will update`, `Unchanged`, `Updated`, `Failed`, `Skipped`, or `Needs review`.
- Booking state: `Has booking` when true.
- Sales Rep state: `Sales Rep: Nick`, `Sales Rep: CRM NICK not linked`, `Sales Rep: already set`, or `Sales Rep: none`.

### Form Lead Collapsed Example

```text
Booked Jobs #1 Abigail Mayo
job_no P5558796 · cubic_feet 300 · prior 5
Matched by phone + email · Unchanged · Has booking · Sales Rep: Nick
```

### Call Lead Booked Row Collapsed Example

```text
Booked Jobs #1 Abigail Mayo
job_no P5558796 · est_cf 300 · prior 5
Matched through booking · Unchanged · Has booking · Sales Rep: Nick
```

### Visual Treatment

Use a card-like block inside the row summary rather than one long flex line. The row summary can remain clickable. Suggested structure:

- First line: row identity.
- Second line: CRM row facts.
- Third line: backend state chips.

Keep the checkbox and Sync button in their existing summary positions. The status card should be the central content between them.

## Expanded Row UX

When a row is opened, show a short plain-English summary above the parsed cell grid. This is not the raw table data and not the long log message. It is a row state explanation.

### Expanded Summary Requirements

Include:

- The Vantage entity found, if any.
- The match method.
- Whether a booking link exists and whether it is preserved.
- Whether sync will update fields or is unchanged.
- Any warnings that affect owner action.
- Sales Rep resolution state.

Then show the existing parsed field grid below.

### Expanded Form Lead Example

```text
Vantage found this form lead by phone and email after the Granot ref_no did not resolve.
The booking link is already attached and will be preserved.
Sync is unchanged: quoted and cubic_feet already match.
Sales Rep matched CRM username NICK to Nick.
```

### Expanded Call Lead Example

```text
Vantage matched this Booked Jobs row through booking job_no P5558796.
Sync is unchanged: no lead or booking fields need changes.
Sales Rep is already linked to Nick.
```

Keep the server-authored `result.message` visible, but move it below this summary or include it as a `Details from Vantage` line. The owner should see the normalized state first.

## Post-Sync Row State

After sync, the collapsed row must show the final result without expansion.

Add a compact row-state card that prefers sync result over preview:

- `Updated`: list changed fields in compact form, for example `Updated: cubic_feet, Sales Rep`.
- `Unchanged`: state that the row already matched Vantage.
- `Failed`: show the short failure reason.
- `Skipped`: show why it was not synced.

The existing `updated` and `unchanged` badges can remain, but the card should carry the meaning.

Examples:

```text
Updated · Changed cubic_feet and Sales Rep
```

```text
Unchanged · Vantage already matched this row
```

```text
Failed · Source mismatch: booking belongs to a different source
```

For call leads, if the sync result includes `warnings`, show the first warning in the collapsed card when it affects action. Keep the full warning list in the expanded row.

## Copy Rules

Use these owner-facing labels:

- `Parsed Rows`, not `parsed row(s)`.
- `Matched In Vantage`, not `found by fallback` as the headline.
- `Matched by phone + email after ref_no failed`, not just `fallback`.
- `Needs Review`, not `invalid`, when the row may still be recoverable or explainable.
- `Granot ref_no did not resolve`, not `invalid ref_no`, when fallback found a lead.
- `Syncable`, not `updateable`, in owner-facing UI. Keep `updateable` only in code/status enums.
- `Unchanged`, not only `idempotent`. Use `idempotent` as supporting text if helpful.
- `Has booking`, only when the matched lead has an attached booking id.
- `Matched through booking`, for `job_no_with_booking`.

Avoid implying these false statements:

- Do not imply a call lead phone number will be overwritten from Granot.
- Do not imply `booked` is a boolean; it is an attached booking link/id.
- Do not imply every `invalid_ref_no` row is unsyncable if fallback resolved it.
- Do not imply form and call `unchanged` have identical write behavior.

## DOM Components

Add reusable DOM builders to `src/entrypoints/popup/ui/components.ts`:

- `summaryMetrics(metrics: SummaryMetric[]): HTMLDivElement`
- `rowStateCard(card: RowStatusCard): HTMLDivElement`
- `stateChip(label, value, tone): HTMLSpanElement`

Possible CSS classes in `index.html`:

- `.summary-metrics`
- `.summary-metric`
- `.summary-metric__label`
- `.summary-metric__value`
- `.row-state-card`
- `.row-state-card__title`
- `.row-state-card__line`
- `.row-state-card__chips`
- `.state-chip`
- `.state-chip.is-good`
- `.state-chip.is-warn`
- `.state-chip.is-bad`
- `.state-chip.is-neutral`

Use the existing color language from `.badge`, `.banner`, and `.match-chip`.

## Implementation Steps

1. Add the pure `leadMessaging.ts` formatter module with scan metric builders and row card builders.
2. Add DOM primitives in `components.ts` for summary metric grids and row state cards.
3. Replace `renderFormLeadsSummary()` textContent with the metric card.
4. Replace `renderCallLeadsSummary()` textContent with the metric card.
5. Update `buildFormLeadRowElement()` so the summary uses a row state card instead of only compact chips.
6. Update `buildCallRowAccordion()` the same way for both Follow Up Estimates and Booked Jobs.
7. Add expanded row summaries above each field grid.
8. Keep the existing parsed field grid, Sales Rep control, log tables, and sync buttons.
9. Update auto-sync cycle copy only if it still exposes the old misleading wording after the UI refactor.
10. Add focused tests for the pure formatter module.

## Test Plan

Add unit tests for `leadMessaging.ts` covering:

- Form lead direct `ref_no` match with changes.
- Form lead direct `ref_no` match with booking and no changes.
- Form lead fallback match after invalid `ref_no`.
- Form lead fallback not found.
- Form lead conflict / needs review.
- Call Follow Up row matched by phone + job_no.
- Call Booked row matched through booking.
- Call row `unchanged`, `updated`, `failed`, and `no_match`.
- Sales Rep states: linked, newly matched, already set, unmatched, blank.

Manual verification:

- Scan a Granot page with both Follow Up Estimates and Booked Jobs tables.
- Confirm the summary is vertical and no longer says `117 invalid` when fallback matched rows.
- Confirm collapsed rows show match method, sync state, booking state, and Sales Rep state.
- Sync one updated row and one unchanged row; confirm both final states are visible while collapsed.
- Open the same rows; confirm the expanded summary explains the state before the cell grid.
- Confirm call lead rows never say the Granot phone will be synced.

## Acceptance Criteria

- The owner can understand scan totals without reading a sentence.
- No headline summary uses `unsupported prior` or `invalid` without context.
- A collapsed row shows match method, sync outcome, booking state, and Sales Rep state.
- A synced row’s final state is visible without opening the row.
- Expanded rows start with a short normalized summary before raw cells.
- Existing parser, preview, sync, and status enums remain unchanged.
- No React or new UI framework is introduced.
