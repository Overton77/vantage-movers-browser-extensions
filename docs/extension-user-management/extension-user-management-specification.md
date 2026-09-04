---
type: Specification
title: Owner Extension User edit, delete, roles array, and session invalidation
description: >-
  Implementation-ready contract so an Extension User holds one or more
  roles, the Admin Dashboard Owner can edit email / password / roles and
  delete the login, leftover Employee becomes Sales plus Customer Service,
  and a credential or roles change ends the Granot extension session.
tags:
  - extension
  - owner
  - admin-dashboard
  - delivery
status: proposed-final
stale_after: 2026-12-04
owners: [team:main-server, team:vantage-admin, team:extension]
applies_to:
  - vantage-main-server/src/models/ExtensionUser.ts
  - vantage-main-server/src/services/extensionUsers/extensionUsers.service.ts
  - vantage-main-server/src/routes/extension-users-admin.routes.ts
  - vantage-main-server/src/auth/extension/session.ts
  - vantage-main-server/src/auth/extension/tokens.ts
  - vantage-main-server/src/middleware/requireApiSecret.ts
  - vantage-admin/components/extension/extension-page.tsx
  - vantage-admin/lib/api/extensionUsers.ts
  - granot_sync_extensions_and_services/src/auth/gate.ts
  - granot_sync_extensions_and_services/src/auth/session.ts
sources:
  - id: glossary
    resource: ../../../CONTEXT.md
    title: Platform glossary
  - id: extension-users
    resource: ../../../vantage-main-server/docs/knowledge/services/extension-users.md
  - id: model
    resource: ../../../vantage-main-server/src/models/ExtensionUser.ts
---

# Owner Extension User edit, delete, roles array, and session invalidation

> **Contract maturity: implementation-ready.** Product rules in this file win
> for stored `roles`, Owner edit/delete, leftover Employee migration, and
> Extension User session invalidation. File citations are evidence; reverify
> line numbers at implementation. Agents work from [`README.md`](README.md) →
> [`AGENT-PROTOCOL.md`](AGENT-PROTOCOL.md) → the matching issue. Do not start
> coding from chat notes.

**Prepared:** 2026-09-04
**Repos:** `vantage-main-server` (model, migration, writes, auth). `vantage-admin` (Owner desk). `granot_sync_extensions_and_services` (workspace gate + session UI).
**Canonical terms:** [Extension User](../../../CONTEXT.md), [Owner](../../../CONTEXT.md), [Sales](../../../CONTEXT.md), [Customer Service](../../../CONTEXT.md), [Employee](../../../CONTEXT.md), [Admin Dashboard](../../../CONTEXT.md), [Enrichment](../../../CONTEXT.md), [Binding Estimate Fee](../../../CONTEXT.md), [Tariff Adjustment](../../../CONTEXT.md)

An Extension User holds **one or more** roles. Sales and Customer Service
may be held together. Access is the **union** of those roles. Leftover
Employee is that same union and is migrated off the stored field.

The Admin Dashboard Owner already creates and lists Extension Users with a
single role. This pack changes the stored field to `roles`, lets the Owner
edit email / password / roles, delete the login, and ends the Granot
browser extension session when those credentials or roles change.

## 1. Problem

1. One stored `role` cannot express “Sales and Customer Service.” Leftover
   Employee is the only way to hold both, and new Employee logins are
   forbidden.
2. The Owner cannot change email, password, or roles from `/extension`.
3. The Owner cannot delete an Extension User from `/extension`.
4. After a credential or role change, a signed-in extension session can
   keep working until the access token expires (~15 minutes). Password-only
   changes are the slow case: access tokens do not carry `token_version`.

## 2. Current-state evidence

Observed 2026-09-04. **Reverify before coding.**

| Fact | Where |
| --- | --- |
| Stored field is singular `role` | `ExtensionUser.ts` |
| Create/list HTTP only | `extension-users-admin.routes.ts` |
| Create body is `{ email, password, role }` | `extensionUsers.validation.ts` |
| Leftover Employee still stored; create rejects it | `STORED_EXTENSION_ROLES` vs `EXTENSION_ROLES` |
| Access token payload is `{ sub, email, role }` | `auth/extension/tokens.ts` |
| Access validation compares singular `role` | `getExtensionUserFromAccessToken` |
| Refresh already checks `token_version` | `refreshExtensionSession` |
| Bearer route allow-list is per single role | `requireApiSecret.ts` `LIMITED_EXTENSION_ROLE_ALLOWED_ROUTES` |
| `VantageAuthContext` user branch has `role: ExtensionRole` | `requireApiSecret.ts` |
| Owner-only writes check `auth.role === "owner"` | `trustedActor.ts`, `existingWriteContext.ts`, `extension-granot-apply.routes.ts` |
| Admin `/extension` is a single role `<select>` | `extension-page.tsx` |
| Extension gate keys off `session.user.role` | `src/auth/gate.ts` |
| Storage validator requires singular `role` | `src/auth/storage.ts` |
| Background auto-sync requires `role === "owner"` | `src/entrypoints/background.ts` |
| Earlier sales-backfill remaps some Employee emails to Sales and leaves others as Employee | `scripts/migrations/extension-user-roles-sales-backfill.lib.ts` |

## 3. Locked decisions

### 3.1 `roles` is the stored field

Mongo `extension_users` stores `roles: Array<"owner" | "sales" | "customer_service">`.

- At least one role.
- Unique values.
- Canonical persist order: `owner`, `sales`, `customer_service`.
- `employee` is never written.

Read helper (one module, used by auth, admin service, and migration):

1. If `roles` is a non-empty array, normalize (unique, current roles only,
   canonical order).
2. Else if leftover `role === "employee"`, treat as
   `["sales", "customer_service"]`.
3. Else if leftover `role` is a current role, treat as `[role]`.
4. Else no roles — reject login and admin update.

Write paths always `$set` `roles` and `$unset` `role`.

### 3.2 Access is the union

| Held roles | Workspaces | Vantage Bearer |
| --- | --- | --- |
| Owner (alone or with others) | All Owner workspaces | All `/api/v1` the Owner may call today |
| Sales only | Binding Estimate Fee | None |
| Customer Service only | Tariff Adjustment | `POST /api/v1/tariff-adjustments` only |
| Sales and Customer Service | Binding Estimate Fee and Tariff Adjustment | `POST /api/v1/tariff-adjustments` only |

Owner already includes every other role's access. Combining Owner with
Sales or Customer Service is allowed and is equivalent to Owner-only for
gates.

Default workspace: Owner → Form Leads; else if Sales is held → Binding
Estimate Fee; else → Tariff Adjustment.

### 3.3 Leftover Employee is migrated, not kept

The earlier sales-backfill is a different script. This pack converts the
**field shape** for every Extension User:

| Stored today | Planned `roles` |
| --- | --- |
| `role: "owner"` | `["owner"]` |
| `role: "sales"` | `["sales"]` |
| `role: "customer_service"` | `["customer_service"]` |
| `role: "employee"` | `["sales", "customer_service"]` |
| already has `roles` | unchanged (no version bump) |

Apply is gated, report is default, and apply increments `token_version` on
every converted row. Follow the sales-backfill CLI shape
(`--report` / `--apply --confirm-production=<db>`). Do not print passwords
or hashes.

After apply, leftover Employee is gone from storage. Dual-read remains so
an un-applied document still logs in.

### 3.4 Edit is PATCH of `roles`, not `role`

`PATCH /api/v1/admin/extension-users/:id` updates any combination of
`email`, `password`, and `roles`. Omitted fields stay unchanged. An empty
password string is omitted. At least one of email, password, or roles must
be present after that normalization.

`roles` on PATCH, when present, must be a non-empty array of current
roles. Same normalize rules as create.

### 3.5 Delete removes the record

`DELETE /api/v1/admin/extension-users/:id` deletes the Mongo document.
That email may be used on a new create.

No Owner deactivate / reactivate control. `active` stays for the ops
script and the list badge.

The Admin Dashboard Owner may delete or demote the last Extension User
who holds Owner. The dashboard login is a different person.

### 3.6 Session invalidation is a consequence

Any **actual** email, password, or roles-set change increments
`token_version`. Password change also sets `password_changed_at`. A no-op
PATCH (normalized email unchanged, password omitted, roles set unchanged)
does not increment `token_version`.

Roles-set compare is membership, not array order.

Delete does not need a version bump: the user is gone.

No separate “Sign out this person” button.

### 3.7 Access tokens carry `roles` and `token_version`

Newly issued access tokens are `{ sub, email, roles, token_version }`.

`getExtensionUserFromAccessToken` after JWT verify:

1. User exists and `active: true`.
2. `payload.email` matches.
3. `payload.roles` is a non-empty array and matches stored roles as a set.
4. `payload.token_version` is a number and matches stored `token_version`.

Any failure → `null` → existing `401`.

Existing access tokens that still have singular `role` or omit
`token_version` fail access validation and force one refresh. Refresh still
uses `{ sub, token_version }` and mints the new shape.

`password_changed_at` remains metadata. Do not compare JWT `iat` to it.

`PublicExtensionUser` is `{ id, email, roles }`. No singular `role`.

### 3.8 Auth context uses `roles`

`VantageAuthContext` user branch stores `roles`, not `role`. Owner-only
server doors (`trustedActor`, `existingWriteContext`, Granot apply,
employee-booking owner check) use `hasExtensionRole(roles, "owner")`.

Limited Bearer allow-list: if Owner is held, allow. Else allow the route
when **any** held role lists it. Sales + Customer Service therefore may
submit Tariff Adjustment. Sales-only still may not.

Tariff `actor_role` (existing string column) writes the canonical join:
`owner`, `sales`, `customer_service`, or `sales+customer_service`. Do not
add a new sheet column.

### 3.9 Owner desk uses role checkboxes

Create and edit use checkboxes for Owner, Sales, and Customer Service. At
least one required. Default create check: Sales.

List shows the role labels joined with ", " (Owner / Sales / Customer
Service). After EUM-01 the admin DTO never returns `employee`; a leftover
Employee document appears as Sales, Customer Service.

### 3.10 Extension gate keys off `roles`

`getAllowedWorkspaces(roles)` unions the workspace lists. Storage accepts
a leftover singular `role` by mapping it through the same read helper, then
`/me` / refresh persist `roles` only.

Open popup (including detached) returns to sign-in when
`granot-sync:auth-session-v1` is cleared. Visibility → visible re-runs
`bootstrapAuthSession()`. No auth heartbeat.

Background auto-sync stays Owner-only: `hasExtensionRole(roles, "owner")`.

### 3.11 Language

Say **Extension User**, **roles**, **Owner**, **Sales**, **Customer
Service**. Say leftover **Employee** only when naming the retired field
value or the migration source. Do not say user (unqualified), agent,
staff, deactivate (on the Owner desk), or soft-delete. Owner-facing copy
never shows `token_version`, `password_hash`, `password_changed_at`, or
raw `customer_service`.

## 4. HTTP

Owner-only. Same envelope as today's create/list. Password and
`password_hash` never appear.

`AdminExtensionUser`:

```ts
{
  id: string;
  email: string;
  roles: Array<"owner" | "sales" | "customer_service">;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}
```

List and create **break** the singular `role` field. EUM-02 must follow
EUM-01 on the same desk before anyone uses `/extension` against the new
API.

### 4.1 Create

```text
POST /api/v1/admin/extension-users
{ email, password, roles }
```

`roles`: non-empty array of `owner` | `sales` | `customer_service`.
Normalize as in §3.1. `employee` → `400`. Empty array → `400`.

Success stays `201 { ok: true, data }`. Duplicate email stays `409`
`An Extension User already uses this email.`

### 4.2 PATCH

```text
PATCH /api/v1/admin/extension-users/:id
{ email?, password?, roles? }
```

| Result | Status | Body |
| --- | --- | --- |
| Changed or no-op on an existing id | `200` | `{ ok: true, data: AdminExtensionUser }` |
| Invalid id or invalid body | `400` | `{ ok: false, error: "Invalid request payload", issues }` |
| Unknown id | `404` | `{ ok: false, error: "Extension User not found." }` |
| Email used by another Extension User | `409` | create duplicate message |
| Dashboard Admin | `403` | existing Owner-only error |

### 4.3 DELETE

```text
DELETE /api/v1/admin/extension-users/:id
```

| Result | Status | Body |
| --- | --- | --- |
| Deleted | `200` | `{ ok: true, data: { id } }` |
| Invalid id | `400` | invalid payload envelope |
| Unknown id | `404` | `{ ok: false, error: "Extension User not found." }` |
| Dashboard Admin | `403` | existing Owner-only error |

Invalid Mongo ObjectId is `400`, not `404`.

### 4.4 Service invariants

- Normalize email before uniqueness check and persist.
- Hash a provided password with the existing `hashPassword`.
- Increment `token_version` only when email, password, or roles set
  actually changed.
- Set `password_changed_at` only when password changed.
- Unique-index race on email → same `409` as create.
- Delete is a hard remove. Do not set `active: false` in this path.
- Creating an Extension User still does not create an Agent.

## 5. Session invalidation (server)

| Owner action | Access token on next call | Refresh |
| --- | --- | --- |
| Password change | version mismatch | version mismatch |
| Email change | email mismatch and version mismatch | version mismatch |
| Roles-set change | roles-set mismatch and version mismatch | version mismatch |
| Delete | user missing | user missing |
| No-op PATCH | still valid | still valid |
| Migration apply | version mismatch | version mismatch |

## 6. Admin Dashboard

Stay on `/extension`. Keep create. Replace the role `<select>` with
checkboxes.

### 6.1 List row

Email, joined role labels, Active / Inactive, **Edit**, **Delete**.

### 6.2 Create and edit

- Checkboxes: Owner, Sales, Customer Service. At least one required.
- Create default: Sales checked.
- Edit prefills the DTO `roles`.
- Password on edit is empty. Hint: leave blank to keep the current
  password.
- Edit Save sends PATCH with only changed fields. Blank password omitted.
  `roles` is sent when the checkbox set differs from the loaded set.
- Success copy: “Extension User created.” / “Extension User updated.”
- Duplicate email uses the server message.

### 6.3 Delete

Confirm before DELETE. Name the email. Say the extension session ends
immediately. Success: “Extension User deleted.”

Do not import `operational-actions` `DeleteConfirmationDialog`. 21st.dev
may craft the edit panel and delete confirm only. It must not invent
endpoints.

### 6.4 Copy

All Owner-visible strings stay in `extension-copy.ts`. Update `pageHint`
to name create, edit, delete, and that one person may hold Sales and
Customer Service. Keep “These people are Extension Users, not Agents.”
No `employeeOption`.

## 7. Granot extension

1. `ExtensionUser` is `{ id, email, roles }`.
2. `gate.ts` unions workspaces from every held role. Owner short-circuits
   to the full Owner list. Drop the leftover Employee workspace table
   after the read helper maps Employee → Sales + Customer Service.
3. Storage leftover `role` is accepted, mapped, and overwritten with
   `roles` after bootstrap.
4. `browser.storage.onChanged` on `granot-sync:auth-session-v1`: cleared →
   clear `cachedSession` and render the login shell if the popup is open.
5. `document.visibilitychange` to `visible` → `bootstrapAuthSession()`.
6. Keep `vantageFetch` 401 → refresh → `signOut()`. Storage change from
   (4) updates the open popup.
7. Popup chrome shows joined labels, not raw keys
   (`owner@… (Sales, Customer Service)`).
8. Auto-sync (`background.ts`, popup owner checks) uses
   `hasExtensionRole(roles, "owner")`.

Do not add a background auth alarm. Do not change Enrichment, Binding
Estimate Fee math, or Tariff Adjustment Submit payloads.

Dev `VITE_VANTAGE_API_SECRET` bypass stays out of this contract.

## 8. Out of scope

- Admin Dashboard Admin access to `/extension`.
- Owner deactivate / reactivate.
- Creating leftover Employee.
- Changing Admin Dashboard operators (`AdminUser`).
- Re-running or changing the email allow-lists in
  `extension-user-roles-sales-backfill`.
- Server-side logout blacklist or websocket force-disconnect.
- Periodic extension auth heartbeat.
- Showing `last_login_at` on the list.
- New glossary terms beyond the resolved Extension User / Employee
  wording already in root `CONTEXT.md`.

## 9. Tests

### 9.1 Server — users service / admin routes / migration

- Create with `roles: ["sales", "customer_service"]` persists canonical
  order and returns that array; no password in DTO.
- Create `roles: ["employee"]` or empty `roles` is `400`.
- Create still rejects duplicate email with the same `409` message.
- List returns `roles`, never singular `role`, never `employee`.
- Dual-read: stored `role: "employee"` lists as
  `["sales", "customer_service"]`.
- PATCH email / password / roles; version bumps only on actual change.
- PATCH roles `["customer_service", "sales"]` equals stored
  `["sales", "customer_service"]` → no version bump.
- PATCH duplicate email is `409`.
- DELETE removes the row; email may be reused.
- Unknown id `404`; invalid ObjectId `400`; Admin `403`.
- Migration report maps the §3.3 table; apply unsets `role`, sets
  `roles`, increments `token_version` only for converted rows.

### 9.2 Server — auth

- Access token includes `roles` and `token_version`.
- Set mismatch, missing `roles`, missing version, email drift, inactive,
  and deleted user all fail `getExtensionUserFromAccessToken`.
- Matching set (order ignored) authenticates.
- `requireApiSecret`: Sales-only cannot POST tariff; Sales+CS can;
  Owner can; Sales-only cannot call Enrichment/apply.
- `hasExtensionRole` Owner checks used by trusted actor / apply still
  pass for `roles: ["owner"]` and `["owner", "sales"]`, fail for
  `["sales", "customer_service"]`.
- Refresh still rejects a stale `token_version`.

### 9.3 Admin

- Create/PATCH send `roles` arrays through
  `/api/proxy/api/v1/admin/extension-users` and `/:id`.
- Copy has no `employeeOption`. Checkboxes, not a single select.
- Admin cannot proxy PATCH or DELETE on `/:id`; Owner can.

### 9.4 Extension

- `getAllowedWorkspaces(["sales", "customer_service"])` equals leftover
  Employee's two workspaces.
- Owner union is the full Owner list.
- Default workspace follows §3.2.
- Storage leftover `{ role: "employee" }` maps to Sales + Customer
  Service.
- Clearing the session key resets popup auth state.
- Visibility re-bootstrap is wired (unit-level).

## 10. Acceptance

1. An Extension User can hold Sales and Customer Service together and
   sees both Binding Estimate Fee and Tariff Adjustment.
2. Owner edits email, password, and roles on `/extension`.
3. Owner deletes an Extension User; that email may be recreated.
4. Leftover Employee documents appear and persist as Sales + Customer
   Service; Employee cannot be created or PATCHed.
5. Dashboard Admin cannot list, create, edit, or delete.
6. After an actual password, email, or roles-set change, the next
   extension `/me` or protected API call is `401` and refresh cannot mint
   a new pair.
7. After delete, `/me` and refresh fail immediately.
8. An open or newly visible extension popup returns to sign-in after the
   session is cleared or fails bootstrap.
9. Password and `password_hash` never appear in admin JSON or UI.
10. Migration report/apply matches §3.3.

## 11. Knowledge after the pack ships

EUM-04 / docs-keeper owns the rewrite. Do not copy this specification
into a Service body.

| File | After ship |
| --- | --- |
| Root `CONTEXT.md` | Already updated at pack authoring: one-or-more roles; Employee retired. Confirm it still matches. |
| `vantage-main-server/docs/knowledge/services/extension-users.md` | `roles` array; create/list/edit/delete; migration; access-token version. |
| `vantage-main-server/docs/index.md` | Service row matches. |
| `vantage-main-server/scripts/migrations/README.md` | New migration commands. |
| `vantage-admin/CONTEXT.md` | Extension tab: roles checkboxes, edit, delete. |
| `vantage-admin/.cursor/rules/project-organization.mdc` | `components/extension/` and `extensionUsers.ts` speak `roles`, PATCH, DELETE. |
| `granot_sync_extensions_and_services/CONTEXT.md` | Union of roles; leftover Employee migrated. |
| `granot-extension-architecture.mdc` | Gate unions `roles`; storage listener + visibility bootstrap. |

## 12. Rollback

Revert `roles` writes and keep dual-read if documents were migrated
(re-apply would need a down-script: `roles` of length 1 → `role`,
`["sales","customer_service"]` → `role: "employee"` only if you must
restore Employee). Prefer not to down-migrate. Revert PATCH / DELETE and
the access-token claim shape. Extension returns to singular `role` gate
only if the server DTO is also reverted.
