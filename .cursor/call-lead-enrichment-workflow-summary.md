# Call Lead Enrichment Workflow Summary

This summary captures the questions answered during the GPT-5.5 planning session for the call lead creation/update workflow across the Vantage server and the Granot browser extension.

## Goal

The feature connects inbound call leads captured by the server with rows from the Granot CRM Follow Up Estimates table. A call initially creates a minimal `CallLead` with phone/timestamp/source metadata. Later, the extension parses Granot CRM rows and asks the production API to preview and sync enrichment updates onto matching `CallLead` documents.

## Source Data

Inbound call capture creates a `CallLead` with:

- `phone_number`
- `timestamp`
- current date metadata
- `source_company`

The Granot Follow Up Estimates table provides enrichment fields:

- `job_no` -> new optional `CallLead.job_no`
- `customer` -> `CallLead.name`
- `email` -> `CallLead.email`
- `phone` -> match against `CallLead.phone_number`
- `from_zip` -> `CallLead.pickup_zip`
- `to_zip` -> `CallLead.delivery_zip`
- `est_cf` -> `CallLead.cubic_feet`

`pickup_state`, `delivery_state`, and `local` are derived from ZIP lookup when possible.

## Matching Decisions

Phone matching is the primary identity for enrichment. Both CRM phone values and stored call lead phone values should be normalized to the last 10 digits. Values with fewer than 10 digits are invalid for matching.

Add `normalized_phone_number` to `CallLead`, populate it on create/update whenever `phone_number` changes, and index it. Existing records may fall back to normalization from `phone_number` until backfilled.

If multiple call leads match the same normalized phone number:

- Prefer unbooked and uncancelled leads when possible.
- Choose the newest remaining candidate by timestamp/created date.
- Return a warning if ambiguity was resolved.
- Do not use the Granot CRM `source` column for this feature.

`source_company` comes from inbound call API metadata, mocked for now, and already exists on the call lead.

## Update And Conflict Rules

Updates are enrichment/correction only. They may apply even if a call lead is already booked or cancelled, but the resolver should prefer unbooked/uncancelled leads when duplicates exist and warn if an already booked/cancelled lead is updated.

Updates should be idempotent:

- Compare incoming CRM fields with the current `CallLead`.
- Return `unchanged` when there are no meaningful changes.
- Only update non-empty, valid, non-placeholder values.
- Treat blanks and placeholders such as `na`, `n/a`, `none`, `null`, and `-` as “do not overwrite.”

`job_no` remains optional in the schema because call leads begin in a pre-enrichment state. However, for this enrichment workflow, the CRM row must contain a usable `job_no`; otherwise the row is invalid/non-syncable.

If a matched call lead already has a different `job_no` than the CRM row, mark the row as `conflict`, do not update it, and show a message in the extension. Override/manual conflict resolution is deferred.

`est_cf` is optional for syncing. If present and parseable, it updates `cubic_feet`; if blank or invalid, skip only `cubic_feet` and continue with other valid fields.

Both `from_zip` and `to_zip` must be valid 5-digit ZIP strings for a row to be updateable. If Zippopotamus cannot resolve a valid ZIP to a state, the row should not fail. Update ZIPs and any resolvable state values, warn about unresolved ZIP-state lookup, and preserve existing `local` when both states are not available. Only recompute `local` when both states resolve.

## Public API Shape

The browser extension runs locally in the owner’s Firefox/Chrome browser and talks to the deployed Vercel API. All extension actions must use protected public `/api/v1` endpoints authenticated by the existing header secret.

Add batch-first public endpoints:

- `POST /api/v1/call-leads/enrichment/preview`
- `POST /api/v1/call-leads/enrichment/sync`

Both accept arrays of structured CRM rows and return per-row results. Sync must re-run matching, conflict detection, and change detection server-side immediately before writing. The extension should send selected raw parsed CRM rows, not trust a previous matched ID from preview.

Add a separate protected public call lead search endpoint for diagnostics/manual lookup. It should allow a constrained payload containing:

- `phone_number`
- `job_no`
- `email`
- `name`
- `limit`

At least one real lookup field is required. Search behavior:

- `phone_number` matches `normalized_phone_number`.
- `job_no` exact matches.
- `email` exact matches normalized lowercase.
- `name` supports case-insensitive fuzzy/contains-style matching.
- Results include booked/cancelled leads by default.
- Return a safe summary, not full raw documents.

Suggested search result fields:

- `_id`
- `timestamp`
- `source_company`
- `name`
- `email`
- `phone_number`
- `normalized_phone_number`
- `job_no`
- `pickup_zip`
- `delivery_zip`
- `pickup_state`
- `delivery_state`
- `local`
- `cubic_feet`
- `booked`
- `cancelled`
- `createdAt`
- `updatedAt`

## Preview And Sync Results

The extension should call the batch preview endpoint after scanning rows. Preview should auto-select only updateable rows and leave all other rows visible but disabled.

Supported statuses:

- `updateable`
- `updated`
- `unchanged`
- `conflict`
- `no_match`
- `invalid`
- `failed`

A row is `updateable` only when:

- It has a usable phone number.
- It resolves to one target after server ranking.
- It has a required usable `job_no`.
- It has no `job_no` conflict.
- It contains at least one meaningful field change.
- It has valid 5-digit `from_zip` and `to_zip`.

Rows that are `unchanged`, `conflict`, `no_match`, or `invalid` remain visible with disabled checkboxes and explanatory messages.

Each per-row result should include:

- `row_id`
- `status`
- `message`
- `call_lead_id` when matched
- `matched_phone_number`
- `job_no`
- `changes`
- `warnings`
- `parsed`

The `parsed` object should echo the server-cleaned values used for validation and update, including normalized phone, cleaned job number, ZIPs, parsed cubic feet, and any resolved states.

Batch sync is best-effort per row. One row failure must not stop other selected rows from syncing.

## Extension UI Decisions

Keep the existing Form Leads quoted workflow unchanged. The Form Leads quoted workflow continues using `ref_no`/`prior`.

The new call-lead enrichment flow belongs only in the Call Leads + Booked Call Leads panel.

Booked Jobs should remain as read-only preview for this unit of work. Follow Up Estimates rows get selectable preview/sync behavior.

Add controls matching the Form Leads workflow:

- Preview/Scan
- Sync Selected
- Sync All Supported
- Select All
- Deselect All

The extension should parse each Follow Up Estimates row into a structured payload before sending to the server:

- `row_id`
- `row_index`
- `job_no`
- `customer`
- `phone`
- `email`
- `from_zip`
- `to_zip`
- `est_cf`

The server still validates and sanitizes everything.

## Google Sheets Decisions

Enrichment updates must trigger the existing Google Sheets sync process for call leads. Both the Master Leads `Calls` tab and each source-company-specific `Calls` tab must be updated.

Overwrite row 1 headers for existing Calls tabs during header setup. The owner plans to clear test data before verification.

Final Calls tab headers:

- `Timestamp`
- `Phone Number`
- `Duration`
- `Booked`
- `Over 2000`
- `Over 4000`
- `Cancelled`
- `Local`
- `Cubic Feet`
- `Mongo ID`
- `Source Company`

Column values:

- `Booked`: `booked` or blank.
- `Over 2000`: `>2k` or blank.
- `Over 4000`: `>4k` or blank.
- `Cancelled`: `cancelled` or blank.
- `Local`: `local`, `long_distance`, or blank when unknown.
- `Cubic Feet`: `CallLead.cubic_feet`.

Do not include `job_no` in Calls sheet columns for this unit. Store it in Mongo for downstream booking workflows.

## Testing And Verification

Dedicated automated tests are intentionally skipped for this unit. Focus on implementation and manual verification afterward.

Mocked inbound call intake should use the existing protected `POST /api/v1/call-leads` endpoint with `phone_number`, `timestamp`, and `source_company`. No mock-only route is needed.

Manual verification should include:

- Creating mock call leads through the public API.
- Scanning the Granot Follow Up Estimates table from the extension.
- Confirming preview statuses and disabled rows.
- Syncing selected updateable rows.
- Verifying Mongo `CallLead` enrichment fields.
- Verifying Master Leads `Calls` and source-company Calls tabs use the final headers and values.

