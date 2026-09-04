# Agent protocol for this pack

Read this once before touching an issue. It is short on purpose.

## 1. Pick up an issue

1. Open [`PROGRESS.md`](PROGRESS.md). Take an issue whose status is
   `ready`. Never start a `blocked` or `deferred` issue.
2. Set its status to `active`, add your start entry to the issue log,
   and say which repository and branch you are on. Do this **before**
   the first edit, so a second agent does not pick up the same issue.
3. Open the issue and read §1 (authorities) and §4 (current-state
   evidence) in full.
4. **Reverify §4 against the repository before writing code.**

Work on the current desk branch if it already is this pack. Create
`extension-user-management` only when that branch does not exist and
the working tree is clean of unrelated work. Server, Admin, and the
extension are separate git roots — stay in the issue’s repository.
Pack markdown lives in `granot_sync_extensions_and_services`. An
EUM-01 or EUM-02 agent may update `PROGRESS.md` and issue drift here
without opening extra feature branches.

## 2. Work the issue

- The pack specification wins. If the issue disagrees, follow the
  specification and fix the issue.
- Scope is §6 bounded by §7. Do not widen. Cross-issue findings go in
  `PROGRESS.md`.
- Writes, `roles[]`, migration, and access-token claims stay in
  `vantage-main-server`. Owner chrome lives in `vantage-admin`. Gate
  union and popup session UI live in
  `granot_sync_extensions_and_services`. Do not invent a second
  Extension User store in Admin or the extension.
- If you are blocked, set the status to `blocked`, record the exact
  question, and stop.

## 3. Close an issue

An issue is `complete` only when every box in its §10 is checked with
evidence and every command in its §11 has been run.

1. Write `reports/EUM-0<n>-completion.md` covering the issue's §14 list.
2. Update `PROGRESS.md`: status, specification-coverage ticks, issue log,
   and unblock the next issue(s).
3. State what you did **not** do, and why.
4. After runtime TypeScript changes, run the issue's focused tests and
   `pnpm typecheck` when practical. EUM-04 owns the docs-keeper pass.

## 4. Rules that override convenience

- **Never mark a criterion checked because it looks right.**
- **Never report complete with a failing or skipped required test.**
- **Never add Owner deactivate** or write `employee` into `roles`.
- **Never add an auth heartbeat** or a standalone sign-out button.
- **Never paste seed passwords** into chat, commits, or this pack.
- **Never enable a write, deploy, or read a live customer payload**
  unless the user explicitly asks.
- **`PROGRESS.md` is a ledger, not an authority.**

## 5. Language

Use workspace-root `CONTEXT.md`. Say Extension User, roles, Owner,
Sales, Customer Service. Leftover Employee is retired. Owner-facing:
edited, deleted, leave blank to keep the current password.
