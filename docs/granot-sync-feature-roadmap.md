# Granot Sync Feature Roadmap

## Purpose

This roadmap describes the next product capabilities for the Granot Sync browser extension and how they should fit into the existing Vantage workflows.

The extension already helps the owner sync Granot CRM table data into Vantage for:

- Form leads from `Booked Jobs` and `Follow Up Estimates`.
- A single form edit lead page.
- Call leads from `Follow Up Estimates`.
- Booked call lead reconciliation from `Booked Jobs`.

The next step is to turn the extension from a sync-only tool into a small Vantage operations workspace: search, verify lead/booking status, and run selected sync jobs automatically when the owner chooses.

## Feature Goals

### 1. Search Workspace

Add a new sidebar workspace for searching Vantage records without first scanning a Granot table.

The owner should be able to search:

- Form leads.
- Call leads.
- Bookings.
- Cancellations.
- Customers.

The first version should keep filters simple:

- `source_company`
- phone number
- email
- name/customer
- job number where the entity supports it
- Granot or Vantage reference id where available

The search view should show compact result cards with enough information to decide whether a record is the right one:

- record type
- Vantage id
- customer/name
- phone and email
- source company
- job number when present
- booked/cancelled status
- created or booked date when present

Call leads and form leads should clearly show if they are attached to a booking. Call leads should also show cancellation status when available.

### 2. Form Lead Fallback Matching

Today, form lead table sync treats the Granot `ref_no` column as a Vantage Mongo `_id`. When that value is missing, invalid, stale, or points to a deleted lead, the row cannot be synced.

The improved behavior should be:

1. Try the Granot `ref_no` value as a Vantage Mongo id when it is valid.
2. If that lookup fails, search Vantage form leads using the row's phone number, email, and customer name.
3. If exactly one confident match is found, show that the match was recovered by fallback fields.
4. If multiple likely matches are found, mark the row as ambiguous and do not sync it automatically.
5. If nothing matches, show that no Vantage lead was found.

Owner-facing copy should be explicit. For example:

- `Found by Mongo id. Booking attached.`
- `No lead found with Granot ref_no, but found by phone and email.`
- `Ambiguous fallback match. Review before syncing.`
- `No Vantage form lead matched this row.`

The resolved Vantage lead id must be stored separately from the Granot `ref_no` value in extension state. This avoids confusing the Granot table value with the actual Vantage record that will be patched.

### 3. Booking Visibility

The extension already receives a `booked` field when a form lead is found by id and receives `has_booking` for call lead preview results.

The UI should make this easier to see:

- Show a booking chip on every lead result after preview or search.
- Distinguish rows that came from Granot's `Booked Jobs` table from leads that have a Vantage booking attached.
- Show the booking id when available.
- Later, enrich the chip with job number and cancellation status from a booking summary endpoint.

For form leads, booking visibility should work for fallback matches too. A row with an invalid Granot `ref_no` can still show `booking attached` if Vantage finds the lead by phone/email/name and that lead has `booked` set.

### 4. Automated Sync Setting

Add an extension-level setting for automated sync:

```json
{
  "automated_sync": {
    "enabled": true,
    "interval_minutes": 5,
    "workflows": {
      "form_leads": true,
      "call_lead_enrichment": true,
      "booked_call_reconciliation": false
    }
  }
}
```

The first owner-facing version should expose:

- enabled/disabled toggle
- interval
- selected Granot tab
- form lead sync on/off
- call lead enrichment on/off
- booked call reconciliation on/off
- last run status
- last error

Booked call reconciliation should be an explicit option because it broadens what unattended sync can update.

### 5. Graceful Wrong-Page Handling

The owner may leave the browser on a `Form Leads`, `Call Leads`, `Follow Up Estimates`, or `Booked Jobs` page. The extension should treat this as normal.

Automated sync should:

- Ask the content script to parse the selected workflow.
- If the expected table is missing, record a skipped cycle rather than throwing a noisy failure.
- Include the page title/url and parser result in the cycle log.
- Continue future cycles instead of disabling automation.

This matters because `Follow Up Estimates` and `Booked Jobs` use similar table structures, and the owner may move between pages during the day.

### 6. Background Worker Model

Automated sync should move out of the popup and into the extension background service worker.

The popup may still provide manual sync and show state, but closing the popup should not stop a configured automated sync job. The background service worker should use extension alarms and send parse messages to the selected Granot tab.

The background worker cannot read Granot DOM directly. It still depends on a live Granot tab with the content script injected.

## Recommended Delivery Order

1. Add the search workspace using existing form/call search endpoints and list endpoints for the other entities.
2. Add form lead fallback matching in preview-only mode.
3. Allow fallback-matched form rows to sync only when the match is confident and not ambiguous.
4. Add booking chips and summary counts that distinguish Granot table source from Vantage booking attachment.
5. Extract parser and workflow modules so popup and background code can reuse them.
6. Implement background automated sync with extension alarms.
7. Add server search endpoints for bookings, cancellations, and customers when list-and-filter is no longer enough.

## Success Criteria

The owner should be able to:

- Find a lead, booking, cancellation, or customer from the extension without opening the server.
- Understand whether a Granot row matched by id or by fallback fields.
- Avoid syncing ambiguous fallback matches.
- See whether a matched lead has a booking attached.
- Leave automated sync enabled without keeping the popup open.
- Review recent automated sync cycles and errors.

