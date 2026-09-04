---
type: Delivery Pack
title: Owner Extension User edit, delete, roles array, and session invalidation
description: >-
  Navigation and status ledger so implementer agents store Extension User
  roles as an array, migrate leftover Employee to Sales plus Customer
  Service, add Owner edit and delete, and end the Granot extension session
  after those changes.
tags:
  - extension
  - owner
  - admin-dashboard
  - delivery
status: ready
stale_after: 2026-12-04
owners: [team:main-server, team:vantage-admin, team:extension]
applies_to:
  - vantage-main-server/src/services/extensionUsers/**
  - vantage-main-server/src/auth/extension/**
  - vantage-admin/components/extension/**
  - granot_sync_extensions_and_services/src/auth/**
---

# Owner Extension User management — delivery pack

Four issues. This pack follows `vantage-main-server/docs/lead-costs-owner-editing/`
and `vantage-main-server/docs/call-lead-contact-provenance/`: same
fourteen-section issue contract, same rule that **repository state is
authoritative and this ledger is a navigation aid**.

Start here → [`AGENT-PROTOCOL.md`](AGENT-PROTOCOL.md) → your issue →
record the result in [`PROGRESS.md`](PROGRESS.md).

This pack does **not** add Owner deactivate, leftover Employee create,
Admin Dashboard Admin access, a standalone sign-out button, or an
extension auth heartbeat. It does **not** re-run the email allow-lists
in `extension-user-roles-sales-backfill`.

## Authorities

The pack lives in `granot_sync_extensions_and_services`. Resolve issue
code paths from that issue’s repository root.

| Order | Authority |
| --- | --- |
| 1 | [`extension-user-management-specification.md`](extension-user-management-specification.md) — **wins on every conflict** |
| 2 | Current repository code, migrations, and tests |
| 3 | Workspace-root `CONTEXT.md` |
| 4 | This pack's issues — sequencing and scope only |

Where this pack and the specification disagree, the specification wins
and the issue author fixes this pack in the same change.

## Session map

| Session | Issue | Repos | Why this size |
| --- | --- | --- | --- |
| **1** | [EUM-01](issues/EUM-01.md) | vantage-main-server | `roles[]`, migration, PATCH, DELETE, access-token claims, Bearer union. Admin cannot ship without it. |
| **2** | [EUM-02](issues/EUM-02.md) | vantage-admin | Owner checkboxes, Edit, Delete on `/extension`. |
| **2** | [EUM-03](issues/EUM-03.md) | granot_sync_extensions_and_services | Gate union + popup sign-in after invalidation. Parallel with EUM-02 after EUM-01. |
| **3** | [EUM-04](issues/EUM-04.md) | docs across the three repos | Knowledge. No runtime. |

Do not start EUM-02 or EUM-03 before EUM-01 is `complete`. EUM-02 and
EUM-03 may run in parallel. Do not start EUM-04 before EUM-01, EUM-02,
and EUM-03 are `complete`.

Do not use `/extension` against an EUM-01 server until EUM-02 is on
that desk — create/list no longer speak singular `role`.

## Language

Use workspace-root `CONTEXT.md`. Say Extension User, roles, Owner,
Sales, Customer Service. Leftover Employee is retired and migrates to
Sales plus Customer Service. Do not say user (unqualified), agent,
staff, deactivate (on the Owner desk), or soft-delete.

## Unit ledger

Status vocabulary: `ready`, `blocked`, `active`, `complete`, `deferred`.
Live values live in [`PROGRESS.md`](PROGRESS.md).

| Issue | Title | Prerequisites | Status | Contract |
| --- | --- | --- | --- | --- |
| [EUM-01](issues/EUM-01.md) | Server `roles[]`, migration, PATCH, DELETE, auth | spec | ready | ready |
| [EUM-02](issues/EUM-02.md) | Owner checkboxes, Edit, Delete on `/extension` | EUM-01 | blocked | ready |
| [EUM-03](issues/EUM-03.md) | Extension role union + ended session | EUM-01 | blocked | ready |
| [EUM-04](issues/EUM-04.md) | Knowledge and map pointers | EUM-01, EUM-02, EUM-03 | blocked | ready |

## Standing constraints for every issue

- **Glossary words only.** Extension User, roles, Owner, Sales, Customer
  Service. Employee only as the retired leftover value.
- **Union of roles.** Sales + Customer Service is Binding Estimate Fee
  and Tariff Adjustment. Owner includes everything.
- **Owner-only.** Dashboard Admin stays `403`.
- **Hard delete.** Do not implement Owner deactivate in this pack.
- **No leftover Employee create or PATCH `employee`.**
- **No heartbeat** and no standalone sign-out button.
- **Do not change** `extension-user-roles-sales-backfill` email lists.
- Synthetic data only. No commit/push/deploy unless the user asks.
- Do not paste `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` into chat,
  commits, or this pack.
- After server changes: focused tests + `pnpm typecheck` in
  `vantage-main-server`.
- After Admin UI changes: `pnpm test`, `pnpm typecheck`, and `pnpm lint`
  in `vantage-admin`. Verify in the browser at **http://localhost:3000**
  ([`LOCAL-ADMIN.md`](LOCAL-ADMIN.md)). The local API is on **3001**.
- After extension changes: the package’s auth/gate tests +
  `pnpm compile` in `granot_sync_extensions_and_services`.

## What this pack deliberately does not do

- Change Enrichment, Tariff Adjustment payloads, or Binding Estimate
  Fee math.
- Touch Admin Dashboard `AdminUser` sessions.
- Add a token blacklist or websocket force-disconnect.
- Show `last_login_at` on the list.

## Layout

```text
docs/extension-user-management/
├── extension-user-management-specification.md   ← the contract
├── README.md                                   ← you are here
├── AGENT-PROTOCOL.md
├── LOCAL-ADMIN.md
├── PROGRESS.md
├── issues/
│   ├── EUM-01.md
│   ├── EUM-02.md
│   ├── EUM-03.md
│   └── EUM-04.md
└── reports/                                    ← one completion report per issue
```
