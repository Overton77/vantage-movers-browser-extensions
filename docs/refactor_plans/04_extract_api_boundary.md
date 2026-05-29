# Unit 04: Extract API Boundary

## Goal

Split the extension API client into domain modules while preserving existing request behavior and import compatibility.

## Why This Comes Fourth

The search workspace, fallback form matching, and background sync all need clearer API boundaries. Splitting transport from endpoint wrappers makes it easier to add new server calls without growing `src/utils/api.ts`.

## Current State

`src/utils/api.ts` currently owns:

- `vantageFetch`
- health ping
- form lead `GET/PATCH`
- call lead enrichment preview/sync
- booked call lead reconciliation preview/sync
- endpoint response types

## Proposed Files

Create:

- `src/api/client.ts`
- `src/api/health.ts`
- `src/api/formLeads.ts`
- `src/api/callLeads.ts`
- `src/api/bookings.ts`
- `src/api/cancellations.ts`
- `src/api/customers.ts`
- `src/api/index.ts`

Update:

- `src/utils/api.ts`
- imports in `src/entrypoints/popup/main.ts`

## Migration Strategy

Keep `src/utils/api.ts` as a compatibility barrel at first:

```ts
export * from "../api";
```

This allows domain modules to exist without forcing every import to change in the same unit. Later units can import from `src/api/*` directly.

## Domain Responsibilities

### `client.ts`

Own:

- `ApiEnvelope`
- `vantageFetch`
- shared error handling
- API base/secret headers

### `formLeads.ts`

Own:

- `FormLeadLookup`
- `FormLeadUpdatePayload`
- `getFormLeadById`
- `updateFormLead`
- later `searchFormLeads`
- later form lead enrichment preview/sync wrappers

### `callLeads.ts`

Own:

- call lead enrichment payload/result types
- booked reconciliation payload/result types
- preview/sync functions
- later `searchCallLeads`

### `bookings.ts`, `cancellations.ts`, `customers.ts`

Start with list wrappers when the search workspace needs them. Add search wrappers later when server endpoints exist.

## Near-Term Additions

This unit can add type-safe wrappers for existing search endpoints if it does not wire UI behavior yet:

- `searchFormLeads`
- `searchCallLeads`
- `listBookedLeads`
- `listCancelledLeads`
- `listCustomers`

These wrappers prepare for the search workspace without changing popup behavior.

## Steps

1. Create `src/api/client.ts` and move `vantageFetch`.
2. Move health ping to `src/api/health.ts`.
3. Move form lead types/functions to `src/api/formLeads.ts`.
4. Move call lead types/functions to `src/api/callLeads.ts`.
5. Add `src/api/index.ts` exports.
6. Convert `src/utils/api.ts` to a compatibility barrel.
7. Update any imports only when simple and low-risk.
8. Run `pnpm compile`.
9. Run `pnpm test`.

## Acceptance Criteria

- Existing API functions keep the same names and behavior.
- `src/utils/api.ts` still satisfies old imports.
- `vantageFetch` is no longer mixed with domain functions.
- Adding search wrappers no longer requires editing a large mixed API file.
- No popup UI behavior changes.

## Safety Notes

- Do not change request paths.
- Do not change header names.
- Do not change API error messages unless tests assert the new behavior.
- Do not remove `VITE_VANTAGE_API_SECRET` validation.

