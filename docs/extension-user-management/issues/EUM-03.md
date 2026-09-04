# EUM-03 — Extension role union and ended session

> **Contract maturity: implementation-ready.** Session 2. Gate
> workspaces from `roles[]`, accept leftover singular `role` in
> storage, and return an open popup to sign-in after invalidation.
> **No Admin UI. No server route changes.**

## 1. Authority and required reading

- **Pack specification:** [`../extension-user-management-specification.md`](../extension-user-management-specification.md)
  — §3.2, §3.10, §7, §9.4, §10.
- **Pack rules:** [`../README.md`](../README.md), [`../AGENT-PROTOCOL.md`](../AGENT-PROTOCOL.md)
- **Architecture:** `.cursor/rules/granot-extension-architecture.mdc`
- **EUM-01 handoff:** `PublicExtensionUser` is `{ id, email, roles }`
- **Glossary:** workspace-root `CONTEXT.md`

## 2. Objective

A signed-in Extension User who holds Sales and Customer Service sees
Binding Estimate Fee and Tariff Adjustment. Owner still sees
everything. After EUM-01 invalidates the session, an open or newly
visible popup shows sign-in instead of a stale workspace.

## 3. Repository, branch, and prerequisites

- **Repository:** `granot_sync_extensions_and_services` only.
- **Branch:** current extension desk branch, or
  `extension-user-management` if that is how this desk is isolated.
- **Prerequisites:** EUM-01 `complete`.
- Pack markdown updates live in this same repository.
- No 21st.dev.
- No commit, push, store publish, or live payload read unless asked.

## 4. Current-state evidence to verify

Observed 2026-09-04; **reverify before coding.** Reverify EUM-01
handoff for `/me` and login DTO shape.

- `src/auth/types.ts` `ExtensionUser.role` is singular.
- `src/auth/storage.ts` accepts one of four role strings.
- `src/auth/gate.ts` maps one role → workspaces. Leftover Employee
  already has both limited workspaces.
- `src/entrypoints/background.ts` `hasOwnerSession` checks
  `role === "owner"`.
- `src/entrypoints/popup/main.ts` and `ui/salesRep.ts` also check
  singular Owner.
- `src/entrypoints/popup/app/render.ts` prints `session.user.role`.
- `vantageFetch` 401 → refresh → `signOut()` does not reset popup
  `state.auth.session`.
- No storage listener and no visibility re-bootstrap.

## 5. Locked decisions and invariants at risk

- Access is the union. Owner short-circuits to the full Owner list.
- Leftover stored `role: "employee"` maps to Sales + Customer
  Service, then `/me` overwrites storage with `roles`.
- Default workspace: Owner → Form Leads; else Sales → Binding
  Estimate Fee; else Tariff Adjustment.
- Auto-sync stays Owner-only via `hasExtensionRole`.
- No auth heartbeat / alarm.
- Do not change Enrichment, Binding Estimate Fee math, or Tariff
  Adjustment Submit payloads.

## 6. Deliverables and exact contract

1. `ExtensionUser.roles`. Shared `hasExtensionRole` /
   leftover-role mapping next to `gate.ts` or `types.ts`.
2. `getAllowedWorkspaces(roles)` unions lists. Drop the Employee
   table after the mapper handles leftover storage.
3. Storage read accepts leftover `{ role }` and `{ roles }`. Writes
   persist `roles` only.
4. `browser.storage.onChanged` on `granot-sync:auth-session-v1`:
   cleared → clear cache and render login if the popup is open.
5. `document.visibilitychange` to `visible` →
   `bootstrapAuthSession()`.
6. Popup chrome prints joined labels (`Sales, Customer Service`).
7. Tests in spec §9.4.

## 7. Out of scope

- Server auth (EUM-01).
- Admin `/extension` (EUM-02).
- Knowledge rewrite (EUM-04) except a one-line architecture note if
  you already have the rule open.
- Periodic `/me` alarm.
- `VITE_VANTAGE_API_SECRET` bypass behavior.

## 8. Tests

Colocate next to `src/auth/gate.ts` / `storage.ts` / `session.ts`.
Existing `src/test/tariff-adjustment.test.ts` session helpers must
build `roles` arrays. Keep `pnpm compile` green.

## 9. Knowledge updates after this issue ships

Optional one-line in
`.cursor/rules/granot-extension-architecture.mdc` if you already
touch it. EUM-04 owns the full map.

## 10. Acceptance criteria

- [x] `getAllowedWorkspaces(["sales", "customer_service"])` is
      Binding Estimate Fee + Tariff Adjustment
- [x] Owner union is the full Owner list, including
      `["owner", "sales"]`
- [x] Default workspace follows spec §3.2
- [x] Leftover stored `role: "employee"` maps to Sales + Customer
      Service
- [x] Auto-sync / Owner chrome use `hasExtensionRole`
- [x] Clearing `granot-sync:auth-session-v1` resets popup auth state
- [x] Visibility-visible re-bootstrap is wired
- [x] 401 → refresh → `signOut()` still clears storage
- [x] `pnpm compile` passes

## 11. Commands

```bash
cd granot_sync_extensions_and_services && pnpm compile
```

Plus the colocated auth/gate tests you add. Paste output in the
completion report.

## 12. Risks

- Leaving `session.user.role` reads in background / popup / salesRep
  Owner checks.
- Treating Sales + Customer Service as Owner.
- Adding a heartbeat alarm “to be safe.”

## 13. Rollback

Restore singular `role` types only if the server DTO is also
reverted. Otherwise keep `roles` and drop the storage listener.

## 14. Handoff list for the completion report

- Gate helper names and default-workspace table
- Where the storage listener and visibility hook live
- What you did not do (Admin, server, docs, heartbeat)

**Unblocks:** EUM-04 (with EUM-02).
