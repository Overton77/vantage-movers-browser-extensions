# EUM-04 completion — Knowledge and map pointers

Closed 2026-09-04. Docs and glob-scoped rules only. No runtime TypeScript.
No live-cluster apply. No commit.

## Files changed

- `vantage-main-server/docs/knowledge/services/extension-users.md` — rewritten for `roles[]`, create/list/edit/delete, leftover Employee dual-read, migration command, access-token `token_version`
- `vantage-main-server/docs/index.md` — Service row and Delivery-pack row now match shipped
- `vantage-admin/CONTEXT.md` — Extension tab: checkboxes, edit, delete; leftover Employee lists as Sales + Customer Service
- `vantage-admin/.cursor/rules/project-organization.mdc` — `components/extension/` and `extensionUsers.ts` speak `roles`, PATCH, DELETE
- `granot_sync_extensions_and_services/CONTEXT.md` — shipped union of roles; leftover Employee migrated; session clear
- `granot_sync_extensions_and_services/.cursor/rules/granot-extension-architecture.mdc` — gate unions `roles`; leftover `{role}` mapped; `browser.storage.onChanged` + visibility; Owner auto-sync via `hasExtensionRole`
- `granot_sync_extensions_and_services/docs/extension-user-management/PROGRESS.md` — EUM-04 complete

Unchanged after confirm:

- Root `CONTEXT.md` — Owner / Sales / Customer Service / Employee / Extension User already match shipped code
- `vantage-main-server/scripts/migrations/README.md` — array migration commands already present and accurate next to sales-backfill

## `okf:query` output (paths only)

```text
docs/knowledge/services/extension-users.md
```

Command: `cd vantage-main-server && pnpm okf:query --type Service --tag extension`

Index row matches the file on disk. Count 1.

## Confirmation

No runtime code in this issue. No production migration apply in this issue.
Apply remains gated; this desk applied once earlier under EUM-01. No emails
listed. Owner deactivate is not claimed. Employee is not restored as creatable.
Not marked `human: verified`.
