# Unit 01: Test Harness And Characterization

## Goal

Add a lightweight test harness and characterization tests before moving business logic. This gives the refactor a safety net and keeps current owner behavior stable.

## Why This Comes First

The extension currently only has `pnpm compile`. Parser behavior and sync payload behavior are business-critical, but they are not protected by tests. The first refactor unit should make it possible to move code with confidence.

## Scope

Add test tooling and fixture structure only. Do not refactor production modules in this unit except for minimal exports needed to test pure helpers.

## Proposed Files

Create:

- `vitest.config.ts`
- `src/test/fixtures/`
- `src/test/fixtures/form-leads-booked-jobs.html`
- `src/test/fixtures/form-leads-follow-up-estimates.html`
- `src/test/fixtures/form-edit-lead.html`
- `src/test/fixtures/call-leads-page.html`
- `src/test/setup.ts` if browser globals need shims

Update:

- `package.json`

## Package Changes

Add dev dependencies:

- `vitest`
- `jsdom`

Add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

## Characterization Targets

### Pure Helpers

Start with helper behavior that can be tested without DOM:

- `intervalMs()` converts seconds, minutes, and hours.
- `buildCycleSummary()` keeps existing message shape.
- `buildFormLeadUpdatePayload()` only includes changed fields.
- `buildFormLeadSyncPayload()` includes idempotent target fields.
- `callLeadRowsToEnrichmentPayloads()` maps row values to server payloads.
- `callLeadRowsToBookedReconciliationPayloads()` includes section/source/prior/book date.

If these helpers are not exportable yet, keep this test file as pending or extract only the smallest pure helper module required. Avoid broad movement in this unit.

### Parser Fixtures

Add fixture files from real or sanitized Granot HTML for:

- Form Leads `Booked Jobs`.
- Form Leads `Follow Up Estimates`.
- Form edit lead page with `ORDREF`.
- Call Leads page with `Booked Jobs` and `Follow Up Estimates`.

The first parser tests can be skipped until Unit 03 if parser functions are not exported yet. The important outcome of this unit is that the fixture and test harness are in place.

## Steps

1. Install test dependencies.
2. Add test scripts.
3. Add Vitest config for TypeScript and JSDOM.
4. Add sanitized fixture HTML files.
5. Add tests for any already-extractable pure helper.
6. Run `pnpm compile`.
7. Run `pnpm test`.

## Acceptance Criteria

- `pnpm compile` passes.
- `pnpm test` exists and runs.
- Fixtures exist for the parser workflows.
- At least one pure helper test is committed, or parser/helper test files are added with clear skipped tests explaining the blocker.
- No owner-facing extension behavior changes.

## Do Not Do In This Unit

- Do not rewrite parser logic.
- Do not split `popup/main.ts` broadly.
- Do not add the search workspace.
- Do not add fallback matching behavior.

