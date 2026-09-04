# PROGRESS — Owner Extension User management

**This is the live ledger. Every issue updates it — on pickup and on close.**
It is a navigation aid, not an authority. Where it disagrees with the
repository, the repository is right and the next agent fixes this file.

Pack created 2026-09-04. Protocol: [`AGENT-PROTOCOL.md`](AGENT-PROTOCOL.md).
Contract: [`extension-user-management-specification.md`](extension-user-management-specification.md).
Updated the same day: stored field is `roles[]`; leftover Employee
migrates to Sales + Customer Service.

## Issue status

| Issue | Title | Prereqs | Status | Owner / agent | Started | Closed | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [EUM-01](issues/EUM-01.md) | Server `roles[]`, migration, PATCH, DELETE, auth | spec | `complete` | cursor-grok-4.6 | 2026-09-04 | 2026-09-04 | [reports/EUM-01-completion.md](reports/EUM-01-completion.md) |
| [EUM-02](issues/EUM-02.md) | Owner checkboxes, Edit, Delete on `/extension` | EUM-01 | `ready` | — | — | — | — |
| [EUM-03](issues/EUM-03.md) | Extension role union + ended session | EUM-01 | `ready` | — | — | — | — |
| [EUM-04](issues/EUM-04.md) | Knowledge and map pointers | EUM-01, EUM-02, EUM-03 | `blocked` | — | — | — | — |

Status vocabulary: `ready` · `active` · `blocked` · `complete` · `deferred`.

## Session plan

| Session | Issues | Notes |
| --- | --- | --- |
| 1 | EUM-01 | Closed. Server. No Admin UI. No extension UI. |
| 2 | EUM-02 and/or EUM-03 | Parallel after EUM-01. Separate git roots. |
| 3 | EUM-04 | Docs-keeper. No runtime. |

## Specification coverage

One row per specification section that this pack owns. A row is ticked
by the issue that closes it, with the evidence named.

| Spec § | Subject | Issue | Done | Evidence |
| --- | --- | --- | --- | --- |
| §3.1–3.3, §4.1 | `roles[]` + leftover Employee dual-read + migration | EUM-01 | ☑ | `src/auth/extension/roles.ts`; `ExtensionUser` model; `extension-user-roles-array` |
| §3.4–3.5, §4.2–4.4 | PATCH / DELETE HTTP and service | EUM-01 | ☑ | `extensionUsers.service.ts`; `extension-users-admin.routes.ts` |
| §3.6–3.8, §5 | Access-token `roles` + `token_version`; auth context | EUM-01 | ☑ | `tokens.ts`; `session.ts`; `requireApiSecret.ts`; Owner doors |
| §3.9, §6 | Owner checkboxes, Edit, Delete | EUM-02 | ☐ | — |
| §3.10, §7 | Extension gate union + popup session sync | EUM-03 | ☐ | — |
| §11 | Knowledge and maps | EUM-04 | ☐ | — |

## Acceptance criteria (specification §10)

| # | Criterion | Issue | Done |
| --- | --- | --- | --- |
| 1 | Sales + Customer Service opens both limited workspaces | EUM-01, EUM-03 | ☐ |
| 2 | Owner edits email, password, and roles on `/extension` | EUM-01, EUM-02 | ☐ |
| 3 | Owner deletes; email may be recreated | EUM-01, EUM-02 | ☐ |
| 4 | Leftover Employee becomes Sales + Customer Service | EUM-01, EUM-02 | ☐ |
| 5 | Dashboard Admin stays 403 | EUM-01, EUM-02 | ☐ |
| 6 | Actual credential/roles change invalidates access + refresh | EUM-01 | ☑ |
| 7 | Delete fails `/me` and refresh immediately | EUM-01 | ☑ |
| 8 | Open / visible popup returns to sign-in | EUM-03 | ☐ |
| 9 | Password never in admin JSON or UI | EUM-01, EUM-02 | ☐ |
| 10 | Migration report/apply matches §3.3 | EUM-01 | ☑ |

EUM-01 closed the server half of #1–#5 and #9 (Bearer union, PATCH/DELETE
HTTP, dual-read, Admin 403, no password in admin JSON). Those boxes stay
open until EUM-02 / EUM-03 close the desk and extension halves.

## Cross-issue findings

Work discovered in one issue that belongs to another. Do not fix it in
place — record it here and in the target issue.

| Found in | Belongs to | Finding | Recorded in issue |
| --- | --- | --- | --- |
| — | — | — | — |

## Issue log

| When | Issue | Event |
| --- | --- | --- |
| 2026-09-04 | pack | Pack authored. EUM-01 is the only `ready` issue. |
| 2026-09-04 | pack | Spec revised: `roles[]`, union access, Employee → Sales + Customer Service migration. |
| 2026-09-04 | EUM-01 | Picked up on `vantage-main-server` branch `call-lead-contact-provenance` (other desk work already present; staying on this branch). |
| 2026-09-04 | EUM-01 | Closed. Server `roles[]`, PATCH/DELETE, access-token version, gated migration. Report: `reports/EUM-01-completion.md`. Unblocked EUM-02 and EUM-03. |
