# EUM-01 — Server `roles[]`, migration, PATCH, DELETE, auth

> **Contract maturity: implementation-ready.** Session 1. Change the
> stored field to `roles`, migrate leftover Employee to Sales plus
> Customer Service, add Owner edit/delete, and put `roles` +
> `token_version` on access tokens. **No Admin UI. No extension UI.**

## 1. Authority and required reading

- **Pack specification:** [`../extension-user-management-specification.md`](../extension-user-management-specification.md)
  — §3.1–3.8, §4, §5, §9.1–9.2, §10. Wins on HTTP, migration, and
  invalidation.
- **Pack rules:** [`../README.md`](../README.md), [`../AGENT-PROTOCOL.md`](../AGENT-PROTOCOL.md)
- **Shipped Service:** `vantage-main-server/docs/knowledge/services/extension-users.md`
- **Existing migration shape:** `scripts/migrations/extension-user-roles-sales-backfill*`
- **Glossary:** workspace-root `CONTEXT.md`

## 2. Objective

Every Extension User is stored and returned as `roles[]`. Leftover
Employee reads and migrates as Sales + Customer Service. The Admin
Dashboard Owner (and EUM-02) can PATCH email / password / roles and
DELETE the login. After an actual credential or roles-set change, the
next extension access-token check fails. After delete, `/me` and
refresh fail because the user is gone. Bearer allow-list is the union
of held roles.

## 3. Repository, branch, and prerequisites

- **Repository:** `vantage-main-server` only.
- **Branch:** current server desk branch, or `extension-user-management`
  if that is how this desk is isolated. See the protocol.
- **Prerequisites:** none. This is the only startable issue.
- Pack markdown updates (`PROGRESS.md`) live in
  `granot_sync_extensions_and_services`.
- No 21st.dev in this issue.
- No commit, push, deploy, live migrate, or live payload read unless
  asked. Migration **report** on synthetic / local data is in scope.
  Production `--apply` is not.

## 4. Current-state evidence to verify

Observed 2026-09-04; **reverify before coding.**

- `ExtensionUser.ts` stores singular `role` with
  `STORED_EXTENSION_ROLES` including leftover `employee`.
- `extension-users-admin.routes.ts` has `GET` and `POST` only.
- `createExtensionUserSchema` is `{ email, password, role }`.
- `PublicExtensionUser` and access tokens use singular `role`.
- `getExtensionUserFromAccessToken` does not check `token_version`.
- `VantageAuthContext` user branch is `{ userId, email, role }`.
- `isLimitedExtensionRoleAllowedRoute` keys off one role string.
- Owner doors: `trustedActor.ts`, `existingWriteContext.ts`,
  `extension-granot-apply.routes.ts`,
  `employeeBookings/reconciliationPolicy.ts`.
- Sales-backfill migration is a **different** script with email
  allow-lists. Do not edit those lists.
- No dedicated `src/auth/extension/*.test.ts` files yet.

## 5. Locked decisions and invariants at risk

- Persist `roles` only. Dual-read leftover `role` per spec §3.1.
- Never write `employee`. Map it to `["sales", "customer_service"]`.
- Canonical order: `owner`, `sales`, `customer_service`.
- Access is the union. Owner includes everything.
- Hard delete. Do not set `active: false`.
- Increment `token_version` only when email, password, or roles set
  actually changed (set membership, not order).
- Empty password string is omitted.
- Access tokens gain `roles` and `token_version`. Missing claims are
  invalid (forces one refresh on deploy).
- `VantageAuthContext` stores `roles`. Owner checks use
  `hasExtensionRole`.
- Do not change sales-backfill email lists.
- Password never leaves the service DTO.

## 6. Deliverables and exact contract

1. Model + `resolveStoredExtensionRoles` / `normalizeExtensionRoles` /
   `hasExtensionRole` in one module. Writes `$unset` `role`.
2. Create body and DTO speak `roles`. List dual-reads leftover `role`.
3. Gated migration `extension-user-roles-array` (name may match the
   package script style). Report default. Apply sets `roles`, unsets
   `role`, increments `token_version` on converted rows. Register in
   `scripts/migrations/README.md` and `package.json`.
4. `PATCH` / `DELETE` `/api/v1/admin/extension-users/:id` per spec §4.
5. Extend `ExtensionUserStore` with find-by-id, update, and delete.
   Keep the injectable store so service tests stay in memory.
6. `issueTokens` includes `roles` + `token_version` on the access
   token. `getExtensionUserFromAccessToken` checks both.
7. Update `VantageAuthContext` and Owner / limited-route callers.
   Limited allow-list: any held role may grant the route; Owner
   short-circuits to allow.
8. Tests in spec §9.1 and §9.2. Keep GET/POST green under the new
   body/DTO.

## 7. Out of scope

- Any `vantage-admin` file (EUM-02).
- Any `granot_sync_extensions_and_services` runtime file (EUM-03).
- Knowledge rewrite (EUM-04). A one-line Service mention is optional
  if you already have the file open.
- Owner deactivate / `active` on the PATCH body.
- Production `--apply`.
- Changing sales-backfill allow-lists.

## 8. Tests

Spec §9.1 and §9.2. Add cases next to the existing service and admin
route tests, the sales-backfill lib tests (new lib, do not edit the
old one), `requireApiSecret.test.ts`, and new
`src/auth/extension/session.test.ts` / `tokens.test.ts`.

## 9. Knowledge updates after this issue ships

Optional one-line in `extension-users.md` if you already have the file
open. EUM-04 / docs-keeper owns the Service rewrite.

## 10. Acceptance criteria

- [x] Create/list persist and return `roles`; never singular `role` in
      the DTO; never `employee` in the DTO
- [x] Dual-read leftover `role: "employee"` as
      `["sales", "customer_service"]`
- [x] Create empty `roles` or `employee` is `400`
- [x] PATCH email / password / roles matches spec §4.2
- [x] PATCH same roles in another order does not increment
      `token_version`
- [x] PATCH duplicate email is `409` with the create message
- [x] DELETE removes the document; email can be reused on create
- [x] Unknown id is `404`; invalid ObjectId is `400`
- [x] Dashboard Admin is `403` on PATCH and DELETE
- [x] Access token carries `roles` + `token_version`; set/version
      mismatch fails `getExtensionUserFromAccessToken`
- [x] Sales-only cannot POST tariff; Sales+CS can; Owner can
- [x] Owner-only apply/trusted-actor doors use `hasExtensionRole`
- [x] Migration report matches spec §3.3; apply is gated
- [x] Package typecheck for the touched files

## 11. Commands

```bash
cd vantage-main-server && pnpm exec tsx --test src/services/extensionUsers/extensionUsers.service.test.ts src/routes/extension-users-admin.routes.test.ts src/auth/extension/session.test.ts src/auth/extension/tokens.test.ts src/middleware/requireApiSecret.test.ts
```

Also run the new migration lib test and the package typecheck. If you
name files differently, run those paths instead. Paste output in the
completion report.

## 12. Risks

- Deploying create/list `roles` before EUM-02 (Admin create breaks).
  Stay on the desk; do not ship this API alone.
- Treating role-array order as a change and kicking a live session.
- Leaving `auth.role` on `VantageAuthContext` and only updating half
  the Owner doors.
- Editing sales-backfill email lists.
- Soft-deleting because the model has `active`.
- Running production `--apply`.

## 13. Rollback

Revert the model writes to singular `role` only if documents were not
migrated. If apply ran, keep dual-read and revert HTTP/auth. Remove
PATCH / DELETE.

## 14. Handoff list for the completion report

- Request/response examples EUM-02 should send (`roles` arrays)
- `PublicExtensionUser` shape EUM-03 should consume
- Error strings as implemented
- Migration command names
- What you did not do (Admin UI, extension UI, production apply, docs)

**Unblocks:** EUM-02, EUM-03.
