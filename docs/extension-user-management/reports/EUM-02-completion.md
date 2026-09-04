# EUM-02 completion — Owner checkboxes, Edit, and Delete on `/extension`

Closed 2026-09-04. Runtime in `vantage-admin` on branch
`call-lead-contact-provenance`. No commit. No push. No production deploy.

## Browser walk

Signed in at http://localhost:3000/login with `ADMIN_SEED_*` from
`vantage-admin/.env` (values not repeated here). Walked
http://localhost:3000/extension as Owner against the local EUM-01 API on
`:3001`.

Admin `.env` still names the deployed API. That host does not serve
`roles[]` yet; the first list paint against it crashed in
`formatExtensionRoleLabels`. The walk restarted Next with a process-only
`VANTAGE_API_BASE_URL=http://localhost:3001` override. The `.env` file
was not edited.

Synthetic emails only:

| Step | Email | Result |
| --- | --- | --- |
| Create with Sales + Customer Service | `eum02-sales-cs-202609041645@example.invalid` | Success copy “Extension User created.” List labels: `Sales, Customer Service`. |
| Edit email | `eum02-edited-202609041645@example.invalid` | Success copy “Extension User updated.” Old address gone from the list. |
| Edit password | same edited address | Success copy. Edit panel closed; password field not left on screen. |
| Add Owner, then remove Owner | same | Labels became `Owner, Sales, Customer Service`, then `Sales, Customer Service`. |
| Save with no role checked | same | UI blocked with “Choose at least one role.” List labels unchanged. |
| Duplicate create | same edited address | Server message “An Extension User already uses this email.” One row only. |
| Delete | same | Confirm named the email and said the extension session ends immediately. After confirm: “Extension User deleted.” Row gone. |

No `@example.invalid` row remained in the live list. Existing
non-synthetic rows were not edited or deleted. Leftover Employee logins
already list as `Sales, Customer Service` (EUM-01 dual-read).

## Copy keys added

In `vantage-admin/components/extension/extension-copy.ts`:

- `pageHint` (updated: create, edit, delete, Sales + Customer Service,
  keep “These people are Extension Users, not Agents.”)
- `passwordEditHint`
- `rolesLabel`
- `rolesRequired`
- `editButton`
- `editTitle`
- `saveButton`
- `savingButton`
- `cancelButton`
- `updated`
- `deleted`
- `deleteButton`
- `deleteConfirmButton`
- `cancelDeleteButton`
- `deleteConfirm(email)`

Removed `roleEmployee` and `roleLabel`. No `employeeOption`.

## Proxy test methods added

`server/auth/authorization.test.ts` “Extension User proxy routes are
Owner-only” now covers `GET`, `POST`, `PATCH`, and `DELETE` on:

- `api/v1/admin/extension-users`
- `api/v1/admin/extension-users/`
- `api/v1/admin/extension-users/user-1`

Admin is false on all of those. Owner is true. Existing
`canAccessDashboardPath("admin", "/extension") === false` kept.

Client tests in `lib/api/extensionUsers.test.ts` POST/PATCH `roles`
arrays through `/api/proxy/api/v1/admin/extension-users` and `/:id`,
DELETE `/:id`, and omit a blank password from PATCH.

## Commands

`pnpm test`: 483 pass / 0 fail.

`pnpm typecheck`: pass.

`pnpm exec tsx --test components/extension/extension-copy.test.ts`:
2 pass / 0 fail.

`pnpm lint` on the EUM-02 files: pass. Package `pnpm lint` still fails
on pre-existing errors in unrelated files (`needs-you`, intakes,
job-timeline, global-search, create-lead-form,
operational-resource-page). Those files were not touched.

## What this issue did not do

- Server validation, migration, or `token_version` (EUM-01)
- Granot extension popup / gate / storage (EUM-03)
- Knowledge Service rewrite or Admin CONTEXT / project-organization
  map (EUM-04)
- Owner deactivate / `last_login_at` on the list
- Employee as a create or edit option
- Commit, push, or deploy
