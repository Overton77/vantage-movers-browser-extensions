# EUM-03 completion — Extension role union and ended session

Closed 2026-09-04. Runtime in `granot_sync_extensions_and_services` on
branch `main`. No commit. No push. No store publish.

## Gate helper names and default-workspace table

Shared role helpers live in `src/auth/roles.ts` (one module):

| Helper | Job |
| --- | --- |
| `resolveStoredExtensionRoles` | Dual-read leftover `{ role }` or `{ roles }` |
| `normalizeExtensionRoles` | Unique current roles, canonical order |
| `hasExtensionRole` | Owner / Sales / Customer Service membership |
| `formatExtensionRoleLabels` | `Owner`, `Sales`, `Customer Service` joined with `", "` |
| `toPublicExtensionUser` | Mint `{ id, email, roles }` |

Gate helpers in `src/auth/gate.ts`:

| Helper | Job |
| --- | --- |
| `getAllowedWorkspaces(roles)` | Union. Owner short-circuits to the full Owner list |
| `canAccessWorkspace(session, workspace)` | Reads `session.user.roles` |
| `defaultWorkspaceForSession(session)` | Spec §3.2 |

Default workspace:

| Held roles | Workspace id |
| --- | --- |
| Owner, alone or with others | `form-leads` (Form Leads) |
| Sales held, and Owner is not | `binding-estimate-fee` (Binding Estimate Fee) |
| Else (Customer Service only) | `tariff-adjustment` (Tariff Adjustment) |
| No session | `form-leads` (existing unsigned-in fallback) |

`getAllowedWorkspaces(["sales", "customer_service"])` is Binding
Estimate Fee + Tariff Adjustment — the same two workspaces leftover
Employee used to have. The leftover Employee workspace table is gone.
Sales + Customer Service is not Owner.

## Storage listener and visibility hook

| Hook | Module | Wired from |
| --- | --- | --- |
| `onAuthSessionStorageChanged(changes, popupAuth?)` | `src/auth/session.ts` | `src/entrypoints/popup/main.ts` `browser.storage.onChanged` on `granot-sync:auth-session-v1`; `src/entrypoints/background.ts` for cache clear only |
| `onDocumentVisible()` | `src/auth/session.ts` | `src/entrypoints/popup/main.ts` `document.visibilitychange` → `visible` → `bootstrapAuthSession()` |

When the session key is cleared, the popup hook also sets
`state.auth.session` to `undefined` and re-renders the login shell.
`vantageFetch` 401 → refresh → `signOut()` still clears storage; the
storage listener updates an open popup. No auth alarm / heartbeat.

## Commands

`pnpm compile`: pass.

Focused EUM-03 tests
(`src/auth`, `src/api/client.test.ts`,
`src/test/tariff-adjustment.test.ts`):

```text
Test Files  6 passed (6)
     Tests  30 passed (30)
```

`pnpm test` (full suite): 175 pass / 1 fail. The failure is unrelated
desk work in `src/test/lifecycle-version.test.ts` (`0.3.1` vs expected
`0.2.8`). That file was not touched.

## What this issue did not do

- Admin Dashboard `/extension` (EUM-02, already closed)
- Server auth, migration, or `token_version` (EUM-01)
- Knowledge Service rewrite or full architecture map (EUM-04) — one
  existing `src/auth/*` line in
  `.cursor/rules/granot-extension-architecture.mdc` now names the
  `roles[]` union and storage / visibility sync
- Periodic `/me` alarm or background auth heartbeat
- Enrichment, Binding Estimate Fee math, or Tariff Adjustment Submit
  payloads
- `VITE_VANTAGE_API_SECRET` bypass behavior
- Commit, push, or store publish
