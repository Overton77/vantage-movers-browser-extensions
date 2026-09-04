# EUM-04 — Knowledge and map pointers

> **Contract maturity: implementation-ready.** Last required issue.
> Rewrite pointers so they describe shipped `roles[]`, Owner
> edit/delete, leftover Employee migration, and session invalidation.
> No runtime. No live-cluster apply.

## 1. Authority and required reading

- **Pack specification:** [`../extension-user-management-specification.md`](../extension-user-management-specification.md)
  — §11.
- **docs-keeper:** workspace `.agents/skills` / `.cursor/agents` docs-keeper
  (preferred).
- **Pack rules:** [`../README.md`](../README.md), [`../AGENT-PROTOCOL.md`](../AGENT-PROTOCOL.md)
- **Index:** `vantage-main-server/docs/index.md`

## 2. Objective

Knowledge files and maps match repository state after EUM-01–03.
Root glossary already says one-or-more roles and retired Employee —
confirm it still matches shipped code. Do not copy this specification
into a Service body.

## 3. Repository, branch, and prerequisites

- **Repositories:** `vantage-main-server`, `vantage-admin`,
  `granot_sync_extensions_and_services` (docs and rules only).
- **Prerequisites:** EUM-01, EUM-02, and EUM-03 `complete`.
- Invoke docs-keeper when more than one Service or glob rule may be
  stale.

## 4. Current-state evidence to verify

Reverify after EUM-01–03. At pack authoring these sentences are
stale once those issues ship:

- `docs/knowledge/services/extension-users.md` — create and list
  only; singular `role`; no PATCH/DELETE
- `docs/index.md` Service row for Extension Users
- `scripts/migrations/README.md` — sales-backfill only
- `vantage-admin/CONTEXT.md` — create and list; singular role
- `vantage-admin/.cursor/rules/project-organization.mdc` —
  `components/extension/` create + list; `extensionUsers.ts` GET/POST
- `granot_sync_extensions_and_services/CONTEXT.md` — leftover
  Employee as a live workspace role
- `granot-extension-architecture.mdc` — singular role gate; no
  storage listener

Root `CONTEXT.md` was updated at pack authoring. Confirm Owner /
Sales / Customer Service / Employee still match shipped behavior.

## 5. Locked decisions and invariants at risk

- Link glossary terms; do not redefine.
- Do not mark `human: verified`.
- Do not claim Owner deactivate shipped.
- Do not restore Employee as a creatable role.

## 6. Deliverables and exact contract

Update exactly the files in pack spec §11. One paragraph per pointer
is enough. Add a Delivery-pack row in `vantage-main-server/docs/index.md`
if it is still missing.

## 7. Out of scope

Runtime code. Live Registry rows. New Service files unless docs-keeper
requires a stub pointer. Production migration apply.

## 8. Tests

```text
cd vantage-main-server && pnpm okf:query --type Service --tag extension
```

Index rows must match files on disk. No skipped query.

## 9. Knowledge updates after this issue ships

This issue **is** the knowledge update.

## 10. Acceptance criteria

- [ ] `extension-users.md` says `roles[]`, create/list/edit/delete,
      migration, and access-token `token_version`
- [ ] `docs/index.md` Service row and Delivery-pack row match
- [ ] Migrations README lists the array migration commands
- [ ] Admin CONTEXT and `project-organization.mdc` speak checkboxes,
      PATCH, DELETE
- [ ] Granot CONTEXT and architecture rule speak role union + session
      clear
- [ ] Root glossary still matches shipped roles
- [ ] `okf:query` lists the touched Service
- [ ] No runtime diff except comments if a source comment would lie

## 11. Commands

```text
cd vantage-main-server
pnpm okf:query --type Service --tag extension
```

## 12. Risks

- Copying this pack’s full spec into the Service file.
- Leaving “create and list only” in Admin CONTEXT.
- Documenting production `--apply` as already run.

## 13. Rollback

Revert the markdown and rule files.

## 14. Handoff list for the completion report

- Files changed
- `okf:query` output (paths only)
- Confirmation no runtime / no production apply
