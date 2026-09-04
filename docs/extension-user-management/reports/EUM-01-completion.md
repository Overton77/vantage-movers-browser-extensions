# EUM-01 completion — Server `roles[]`, migration, PATCH, DELETE, auth

Closed 2026-09-04. Runtime in `vantage-main-server` on branch
`call-lead-contact-provenance`. No commit. No push. No production apply.

## Request / response examples for EUM-02

Create:

```http
POST /api/v1/admin/extension-users
{ "email": "rep@vantage.example", "password": "at-least-8", "roles": ["sales", "customer_service"] }
```

Success `201`:

```json
{
  "ok": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "rep@vantage.example",
    "roles": ["sales", "customer_service"],
    "active": true,
    "created_at": "2026-09-04T16:00:00.000Z",
    "last_login_at": null
  }
}
```

PATCH (omit unchanged fields; empty password string is omitted):

```http
PATCH /api/v1/admin/extension-users/507f1f77bcf86cd799439011
{ "email": "new@vantage.example" }
```

```http
PATCH /api/v1/admin/extension-users/507f1f77bcf86cd799439011
{ "roles": ["owner", "sales"] }
```

```http
PATCH /api/v1/admin/extension-users/507f1f77bcf86cd799439011
{ "password": "new-password" }
```

Success `200` `{ "ok": true, "data": AdminExtensionUser }` — same shape as
create `data`. Never `role`. Never `employee`. Never `password` /
`password_hash`.

DELETE:

```http
DELETE /api/v1/admin/extension-users/507f1f77bcf86cd799439011
```

Success `200`:

```json
{ "ok": true, "data": { "id": "507f1f77bcf86cd799439011" } }
```

List is still `GET /api/v1/admin/extension-users` →
`{ "ok": true, "data": AdminExtensionUser[] }` with `roles` arrays.

## `PublicExtensionUser` for EUM-03

```ts
{
  id: string;
  email: string;
  roles: Array<"owner" | "sales" | "customer_service">;
}
```

No singular `role`. Leftover stored `role: "employee"` resolves to
`["sales", "customer_service"]` before this DTO is minted.

Access tokens are `{ sub, email, roles, token_version }`. Refresh stays
`{ sub, token_version }` and mints the new access shape.

## Error strings as implemented

| Case | Status | Body |
| --- | --- | --- |
| Invalid id or body (including empty `roles`, leftover `employee`, empty PATCH after password omission) | `400` | `{ ok: false, error: "Invalid request payload", issues }` |
| Unknown id | `404` | `{ ok: false, error: "Extension User not found." }` |
| Duplicate email on create or PATCH | `409` | `{ ok: false, error: "An Extension User already uses this email." }` |
| Dashboard Admin | `403` | existing Owner-only registry error |

## Migration command names

```text
pnpm migration:extension-user-roles-array
pnpm migration:extension-user-roles-array -- --report
pnpm migration:extension-user-roles-array -- --apply --confirm-production=<db>
```

Report is default. Combined `--report` + `--apply` is refused. Apply
requires `--confirm-production=<db>`. Converted rows `$set` `roles`,
`$unset` `role`, and `$inc` `token_version`. Rows that already have
`roles` are unchanged.

Local report against the configured database (counts only): 6 documents,
1 leftover Owner, 5 leftover Employee, 0 already-has-roles. No apply.

## Tests and typecheck

Required command: 44 pass / 0 fail.

`pnpm typecheck`: pass.

Related fixture suites (trusted actor, existing write context, Granot
apply, tariff, reconciliation, Google Drive owner): 51 pass / 0 fail.

## What this issue did not do

- Admin Dashboard UI (EUM-02)
- Granot extension UI / gate / storage (EUM-03)
- Knowledge Service rewrite (EUM-04)
- Production `--apply`
- Owner deactivate / PATCH `active`
- Sales-backfill email-list edits
- Token blacklist or heartbeat
- Soft-delete
