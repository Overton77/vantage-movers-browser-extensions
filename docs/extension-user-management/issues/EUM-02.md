# EUM-02 — Owner checkboxes, Edit, and Delete on `/extension`

> **Contract maturity: implementation-ready.** Session 2. Create and
> edit use `roles` checkboxes. Add Edit and Delete. **No server route
> changes. No Granot extension runtime.**

## 1. Authority and required reading

- **Pack specification:** [`../extension-user-management-specification.md`](../extension-user-management-specification.md)
  — §3.9, §6, §8, §9.3, §10.
- **Pack rules:** [`../README.md`](../README.md), [`../AGENT-PROTOCOL.md`](../AGENT-PROTOCOL.md)
- **Local desk:** [`../LOCAL-ADMIN.md`](../LOCAL-ADMIN.md)
- **Admin map:** `vantage-admin/.cursor/rules/project-organization.mdc`
- **Glossary:** workspace-root `CONTEXT.md`

## 2. Objective

The Admin Dashboard Owner can create an Extension User with one or
more roles (Sales and Customer Service together is the point), edit
email / password / roles, and delete that login, on `/extension`.
Dashboard Admin still cannot open the page or call the proxy.

## 3. Repository, branch, and prerequisites

- **Repository:** `vantage-admin` only.
- **Branch:** current admin desk branch, or `extension-user-management`
  if that is how this desk is isolated.
- **Prerequisites:** EUM-01 `complete`.
- Pack markdown updates live in `granot_sync_extensions_and_services`.
- 21st.dev may craft the edit panel and delete confirm only, against
  the existing create-form chrome. It must not invent endpoints.
- Verify in the browser at http://localhost:3000/extension.
- No commit, push, or deploy unless asked.

## 4. Current-state evidence to verify

Observed 2026-09-04; **reverify before coding.** Reverify EUM-01
handoff for the exact create / PATCH / DELETE bodies.

- `extension-page.tsx` is create + read-only list with a single role
  `<select>`.
- `lib/api/extensionUsers.ts` has `role` / `CreateExtensionRole`.
  After EUM-01 the server speaks `roles`.
- `EXTENSION_COPY` has no edit / delete strings. Tests assert there
  is no `employeeOption`.
- Proxy already blocks Admin for
  `/api/v1/admin/extension-users` and
  `/api/v1/admin/extension-users/`. `canProxyVantagePath` tests cover
  GET/POST only.
- `requestJson` expects `{ ok: true, data }`. EUM-01 DELETE returns
  `200 { ok: true, data: { id } }`.
- `queryKeys.extensionUsers.all` already invalidates the list.

## 5. Locked decisions and invariants at risk

- Stay on `/extension`. No new route.
- Checkboxes for Owner, Sales, Customer Service. At least one
  required. Default create: Sales.
- Never show or send Employee.
- Blank password is omitted from PATCH.
- Send only changed fields. Send `roles` when the checkbox set
  differs from the loaded set.
- Hard delete with a local confirm. Do not import
  `operational-actions`.
- Password never rendered.

## 6. Deliverables and exact contract

1. Types and helpers in `lib/api/extensionUsers.ts`: `roles` on the
   DTO; `createExtensionUser({ email, password, roles })`;
   `updateExtensionUser`; `deleteExtensionUser`.
2. Create form checkboxes. List shows joined role labels.
3. List row **Edit** and **Delete**.
4. Edit panel per spec §6.2.
5. Delete confirm per spec §6.3.
6. `EXTENSION_COPY` for roles / edit / delete / leave-blank password /
   updated `pageHint` (one person may hold Sales and Customer
   Service).
7. Tests in spec §9.3, including Admin `403` on PATCH / DELETE
   proxy paths.
8. Browser walk: create Sales+Customer Service, edit email, edit
   password, add/remove a role, delete, confirm the list.

## 7. Out of scope

- Server validation, migration, or `token_version` (EUM-01).
- Extension popup / gate (EUM-03).
- Knowledge rewrite (EUM-04).
- Deactivate control.
- Showing `last_login_at`.
- Settings tab or a new sidebar item.

## 8. Tests

```text
vantage-admin/lib/api/extensionUsers.test.ts
vantage-admin/components/extension/extension-copy.test.ts
vantage-admin/server/auth/authorization.test.ts
```

Browser walk is required. A screenshot is not enough.

## 9. Knowledge updates after this issue ships

Do not rewrite Admin CONTEXT or the project-organization rule here
beyond a one-line planned→shipped note if you already have the file
open. EUM-04 owns the map.

## 10. Acceptance criteria

- [ ] Create with Sales + Customer Service succeeds and lists both
      labels
- [ ] Edit email, password, and roles succeed on `/extension`
- [ ] Blank password leaves the hash unchanged
- [ ] Saving with no role checked is blocked in the UI
- [ ] Delete confirm names the email; after confirm the row is gone
- [ ] Duplicate-email error shows the server message
- [ ] Dashboard Admin still cannot open `/extension` or proxy
      PATCH / DELETE
- [ ] Copy tests still forbid `employeeOption`
- [ ] Client tests hit `/api/proxy/api/v1/admin/extension-users` and
      `/:id` with `roles` arrays
- [ ] Browser walk recorded in the completion report
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the
      touched package

## 11. Commands

```bash
cd vantage-admin && pnpm test && pnpm typecheck && pnpm lint
```

Then walk http://localhost:3000/extension as Owner. Sign in from
`vantage-admin/.env` (`ADMIN_SEED_*` only). Do not paste those
values.

## 12. Risks

- Sending the blank password string and triggering a `400`.
- Keeping a single `<select>` and only renaming the field.
- Importing the operational delete dialog and coupling this page to
  OSE.

## 13. Rollback

Remove row actions, restore a create-only form that still speaks
`roles` if EUM-01 stays deployed. Do not restore singular `role`
against an EUM-01 server.

## 14. Handoff list for the completion report

- Browser walk notes (synthetic emails only)
- Copy keys added
- Proxy test methods added
- What you did not do (server, extension, docs)

**Unblocks:** EUM-04 (with EUM-03).
