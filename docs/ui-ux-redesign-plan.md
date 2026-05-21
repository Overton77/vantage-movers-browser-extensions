# Granot Sync — UI/UX Redesign Plan

> Status: **proposal / discussion draft** — nothing has been changed in code yet.
> Target files: `src/entrypoints/popup/index.html`, `src/entrypoints/popup/main.ts`,
> plus a small CSS/HTML refactor. The content script (`granot-crm.content.ts`)
> and API client (`utils/api.ts`) do **not** need changes for this redesign.

---

## 1. Goals (re-stating what we're solving)

Today everything is one long stack of three workflow cards plus a global status
line and a global rows panel. The owner has to scroll, hunt for which controls
belong to which workflow, and the ScanAndSync output is one giant pipe-delimited
string per cycle.

We want:

1. **A single, persistent left sidebar** that switches between three workspaces:
   1. **Form Leads (Table)** — Quoted + Cubic Feet, with select/sync all/single, ScanAndSync.
   2. **Form Edit Lead (Single)** — preview the form-edit page lead and sync it (rarely used).
   3. **Call Leads (Table)** — Match Follow Up Estimates rows to Call Leads by phone, with select/sync all/single, ScanAndSync. `prior = 5` Booked Jobs are read-only.
2. **Symmetric UX** between Form Leads (Table) and Call Leads (Table) — same controls, same vocabulary, same layout. Once the owner learns one, they know the other.
3. **Per-row Sync button** on every syncable row so the owner can fire one update without using checkboxes.
4. **"Log Tables" button per workspace** (not the dev "Debug: Log Tables") that both `console.table()`s and renders an in-popup readable table.
5. **A friendlier ScanAndSync**: interval picker with seconds/minutes/hours dropdown, a tooltip/explainer of exactly what the loop does, accordion sections so each cycle is collapsible, and **the manual selectable rows disappear while ScanAndSync is running** so the owner doesn't accidentally fight with the auto-sync.
6. **Works in both popup AND movable detached window** (already supported via `?detached=1&targetTabId=…`, just needs the new layout to be responsive).

---

## 2. Top-level layout

The same shell renders in the toolbar popup and the detached movable window.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Granot Sync   v1.x.y          [● Connected to tab #1234]      [⤢ Movable Window]  │  ← Top bar
├──────────────┬─────────────────────────────────────────────────────────────────────┤
│              │                                                                     │
│  SIDEBAR     │  MAIN WORKSPACE                                                     │
│              │                                                                     │
│  ▣ Form      │  (current workspace content renders here — see §3, §4, §5)          │
│    Leads     │                                                                     │
│              │                                                                     │
│  ▢ Form Edit │                                                                     │
│    Lead      │                                                                     │
│              │                                                                     │
│  ▢ Call      │                                                                     │
│    Leads     │                                                                     │
│              │                                                                     │
│  ─────────   │                                                                     │
│  ▢ Diagnose  │                                                                     │
│  ▢ Debug Log │                                                                     │
│              │                                                                     │
├──────────────┴─────────────────────────────────────────────────────────────────────┤
│  STATUS BAR:  Found 12 row(s), 9 syncable. Last action: 16:04:12.                  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Sidebar behavior

- **Always visible** — fixed left column (about 180px wide).
- Each item is a vertical tab. The active tab is highlighted with the accent
  blue (`#2563eb`).
- Tabs:
  - **Form Leads** (icon: 📋) — `mode = "follow-up"`
  - **Form Edit Lead** (icon: ✏️) — `mode = "current-lead"`
  - **Call Leads** (icon: 📞) — `mode = "call-leads"`
  - Divider
  - **Diagnose** (icon: 🩺) — `mode = "diagnostics"` (existing diagnose-page flow)
  - **Debug: Log Tables** (icon: 🪲) — keeps existing "dump tables → console" feature
- Switching a tab does **not** clear data for other tabs. Each workspace keeps
  its own state (parsed rows, selected rows, sync results, ScanAndSync timer)
  so the owner can hop between them without losing progress.

### Top bar

- Extension name + version (from `manifest.version`).
- Connection chip: shows green dot + active tab id (and pattern matched), or
  a red dot + "no Granot tab" hint.
- **Movable Window** button (existing `#open-detached`). If already detached,
  swap the label to "Movable Window Active" (existing behavior, keep it).

### Status bar

- Replaces today's giant `#status` div with a thin sticky strip at the bottom.
- Shows last-action message + a small spinner when `isBusy === true`.
- Errors are red-tinted; success is grey.

### Responsiveness (popup vs detached)

- Popup default width 860–980px (today's value). At <740px, the sidebar
  collapses to icon-only (still visible, just narrower). Below ~520px it
  becomes a top horizontal tab strip.
- Detached window opens at 980×800 (slightly taller than today's 760).

---

## 3. Workspace A — Form Leads (Table)

This is the busiest workspace; everything else takes cues from it.

### 3a. Layout when **ScanAndSync is OFF** (idle / manual mode)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Form Leads — Quoted + Cubic Feet                                            │
│  Sync the Quoted and Cubic Feet columns of Form Leads from the Granot        │
│  "Follow Up Estimates" table into Vantage.                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────── ACTIONS ────────────────────────────────────────────────────┐     │
│  │ [Scan Follow Up Table]   [Log Tables 📋]                            │     │
│  │                                                                     │     │
│  │ [Sync Selected]  [Sync All Supported]                               │     │
│  │ [Select All]  [Deselect All]                                        │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌──────── SCAN-AND-SYNC (auto loop) ──────────────────────────────────┐     │
│  │ ⓘ Hover/click for explanation                                       │     │
│  │                                                                     │     │
│  │ Run every:  [  5  ▼]  [Seconds ▼]    Progress filter: [Show All ▼]  │     │
│  │                                                                     │     │
│  │ [▶ Start ScanAndSync]   [■ Stop]                                    │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Summary:  12 parsed row(s) — 9 syncable, 1 unsupported, 2 invalid.          │
│            9 selected.                                                       │
│                                                                              │
│  ┌──────── SYNCABLE TABLE SCAN (selectable) ───────────────────────────┐     │
│  │ ☑ #1   Jane Smith    ref_no=… prior=1   est_cf=850     [Sync]       │     │
│  │ ☑ #2   John Doe      ref_no=… prior=0   est_cf=—       [Sync]       │     │
│  │ ☑ #3   Acme Co       ref_no=… prior=1   est_cf=2100    [Sync]       │     │
│  │ ☐ #4   …  unsupported prior (Level-2)               [—]             │     │
│  │ ☐ #5   …  invalid ref_no                            [—]             │     │
│  │ …                                                                   │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ▾ ScanAndSync History (collapsed when idle)                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key changes vs today:

- **`[Sync]` button** appears on every syncable row, right-aligned. It calls
  the existing `syncLeadCandidates([row])` flow for just that row. Disabled
  while `isBusy`.
- **`[Log Tables]`** button replaces the old "Debug: Log Tables" for this view
  only. It scans the current page, `console.table(rows)`s the parsed result,
  AND opens a modal/expandable accordion in-view showing the parsed table as
  HTML so the owner can eyeball every column without flipping to DevTools.
  (The old global "Debug: Log Tables" stays available under the sidebar's
  Debug section for raw HTML table dumps.)
- **Single per-row syncing** is independent of selection state — clicking
  `[Sync]` does not change which checkboxes are ticked.

### 3b. Layout when **ScanAndSync is ON** (auto loop running)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Form Leads — Quoted + Cubic Feet               [● Auto-syncing every 30s]   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠ Manual selection is paused while ScanAndSync is running.                  │
│     Stop the loop below to scan and sync rows by hand again.                 │
│                                                                              │
│  ┌──────── SCAN-AND-SYNC ──────────────────────────────────────────────┐     │
│  │ Running since 16:02:18  ·  Next run in 00:00:14                     │     │
│  │ Run every:  [ 30 ▼]  [Seconds ▼]   (disabled while running)         │     │
│  │ Progress filter: [Show All ▼]                                       │     │
│  │ [▶ Start]   [■ Stop ScanAndSync]                                    │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌──────── SCAN-AND-SYNC PROGRESS ─────────────────────────────────────┐     │
│  │ ▾  Cycle #4 — 16:04:42   ✓ OK   9 syncable, 8 updated, 1 unchanged  │     │
│  │      ├ #1 Jane Smith     ref_no=…  quoted 0→1, cf 800→850   ✓       │     │
│  │      ├ #2 John Doe       ref_no=…  already quoted=0          —      │     │
│  │      └ #3 Acme Co        ref_no=…  cf 2050→2100              ✓      │     │
│  │                                                                     │     │
│  │ ▸  Cycle #3 — 16:04:12   ✓ OK   9 syncable, 9 updated  (collapsed)  │     │
│  │ ▸  Cycle #2 — 16:03:42   ✗ 1 FAILED                    (collapsed)  │     │
│  │ ▸  Cycle #1 — 16:03:12   ✓ OK                          (collapsed)  │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key changes vs today:

- **The scrollable selectable row list is hidden** while ScanAndSync runs.
  Today it stays visible and the owner can still click checkboxes that the
  next cycle promptly overrides — confusing.
- **Each cycle is an accordion**, latest at the top, expanded by default.
  Older cycles collapse to one line.
- **Progress lines are stacked** (one per row) instead of `pipe | separated |
  on | one | line`. Status icon ✓/—/✗ replaces text.
- **Interval is shown in human time** — picker is value + unit dropdown.
  Stored internally as ms. Validation: minimum 5 s, maximum 24 h.
- Once ScanAndSync is stopped, view falls back to 3a, with the most recent
  cycle's history preserved as a collapsed accordion at the bottom.

### 3c. The "Run every" interval picker

```
   Run every:  [   30   ]  [ Seconds  ▼ ]
                            │ Seconds  │
                            │ Minutes  │
                            │ Hours    │
                            └──────────┘
```

- Defaults: 30 seconds.
- Internally stored as `intervalMs`. Replaces today's `min=15 step=15 sec`
  number input.
- Disabled while the loop is running (today's behavior).

### 3d. The ScanAndSync explainer (tooltip / "ⓘ" info popover)

When the owner hovers/clicks the ⓘ icon (or it auto-shows the first time),
display this exact wording (or close to it) in an inline expandable callout:

```
What ScanAndSync does, every <interval>:

  1. Re-scan the current Granot "Follow Up Estimates" table on the active tab.
  2. For each row that has a valid ref_no AND a prior of 0 or 1:
       a. Look up the current Form Lead in Vantage.
       b. Compare its `quoted` and `cubic_feet` to the table row.
       c. If they differ, PATCH the Form Lead with the new values.
  3. Rows with invalid/missing ref_no, missing prior, or prior > 1 are SKIPPED.
  4. Booked jobs (prior 5) are not in this table and are not touched.
  5. Errors do not stop the loop — they show up in the cycle's progress list.

This is identical to clicking "Sync All Supported" once per interval.
```

The Call Leads workspace gets an analogous explainer (see §5).

---

## 4. Workspace B — Form Edit Lead (Single)

Used rarely. The current preview is fine but cramped — let's make the
"current vs target" comparison the centerpiece.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Form Edit Lead — Quoted Override                                            │
│  Use this on the Granot "Edit Form Lead" page to PATCH a single Form Lead.   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Re-scan Current Page]                                                      │
│                                                                              │
│  ┌── CURRENT LEAD ─────────────────────────────────────────────────────┐     │
│  │ ref_no:        67abcd…ef91                                          │     │
│  │ Granot prior:  Level-1                              [syncable ✓]    │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌── DIFF PREVIEW ─────────────────────────────────────────────────────┐     │
│  │ Field          │ Current (Vantage) │  →   │ Target (Granot/Override)│     │
│  │ ───────────────┼───────────────────┼──────┼─────────────────────────│     │
│  │ quoted         │ false             │  →   │ true                    │     │
│  │ cubic_feet     │ —                 │  →   │ —                       │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Sync target:  ( ) Use parsed priority (Level-1 → quoted=true)               │
│                ( ) Override to Quoted (true)                                 │
│                ( ) Override to Not Quoted (false)                            │
│                                                                              │
│  [Sync Current Lead]                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key changes vs today:

- The big confusing "field-grid" becomes a real two-column **current → target
  diff table**. If a field will not change, it's greyed out; if it will, the
  arrow + target are highlighted.
- Override dropdown becomes a radio group with the same three options. Easier
  to scan at a glance.
- No checkboxes, no select-all, no ScanAndSync here.
- No `[Log Tables]` button here — there's only one lead.

---

## 5. Workspace C — Call Leads (Table)

Designed to **mirror Workspace A**. Same outer shape, same controls, same
ScanAndSync. The data inside is just call-lead-shaped instead of
form-lead-shaped.

### 5a. Idle mode

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Call Leads — Match by Phone & Enrich                                        │
│  When a CSR creates a Call Lead in the CRM and the customer's phone matches  │
│  a Follow Up Estimate row, sync job_no, cubic_feet, zips, and customer       │
│  info from the Granot row onto the Call Lead in Vantage.                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────── ACTIONS ────────────────────────────────────────────────────┐     │
│  │ [Scan Call Leads View]   [Log Tables 📋]                            │     │
│  │                                                                     │     │
│  │ [Sync Selected]  [Sync All Supported]                               │     │
│  │ [Select All]  [Deselect All]                                        │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌──────── SCAN-AND-SYNC ──────────────────────────────────────────────┐     │
│  │ ⓘ Hover/click for explanation                                       │     │
│  │ Run every:  [  1  ▼]  [Minutes ▼]    Progress filter: [Show All ▼]  │     │
│  │ [▶ Start ScanAndSync]   [■ Stop]                                    │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Summary:  10 row(s) found · 6 updateable · 4 booked (skipped) · 6 selected. │
│                                                                              │
│  ┌──────── FOLLOW UP ESTIMATES (updateable) ───────────────────────────┐     │
│  │ ☑ #1  Jane Smith   phone 555-…  job_no 12345  est_cf 850   [Sync]   │     │
│  │ ☑ #2  John Doe     phone 555-…  job_no 12346  est_cf —     [Sync]   │     │
│  │ ☐ #3  No Match     phone 555-…  no call lead found         [—]      │     │
│  │ …                                                                   │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌──────── BOOKED JOBS (read-only, prior=5) ───────────────────────────┐     │
│  │ ▸ 4 booked job(s) — skipped by ScanAndSync (click to expand)        │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ▾ ScanAndSync History (collapsed when idle)                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5b. Running mode

Same treatment as §3b: the selectable Follow Up Estimates list is replaced by
the cycle accordion, the Booked Jobs accordion stays available but stays
collapsed by default, and a banner says "Manual selection is paused while
ScanAndSync is running."

### 5c. Notes specific to Call Leads

- **Booked Jobs (`prior = 5`)**: always rendered in a separate, secondary,
  collapsed-by-default accordion below the syncable table. Never has
  checkboxes, never has a `[Sync]` button. Title bar says "X booked job(s) —
  skipped by ScanAndSync" so the owner instantly knows these are intentional.
- **The per-row `[Sync]`** calls `syncCallLeadEnrichment([row.payload])`
  for just that row — already supported by the existing `/api/v1/call-leads/
  enrichment/sync` endpoint, just needs a one-row caller path.
- **The status badge** ( `updateable` / `updated` / `no_match` / `conflict` /
  `failed` / `invalid` ) stays on the row, but we color-code:
  - `updateable` / `updated` → green
  - `unchanged` → grey
  - `no_match` → yellow
  - `conflict` / `failed` / `invalid` → red

### 5d. The ScanAndSync explainer for Call Leads

```
What ScanAndSync does, every <interval>:

  1. Re-scan the current Granot "Call Leads" page on the active tab
     (it has both Follow Up Estimates and Booked Jobs tables).
  2. For each row in Follow Up Estimates:
       a. Send its phone, job_no, customer, zips, and est_cf to Vantage.
       b. Vantage looks up a Call Lead by phone number.
       c. If found and the fields differ, Vantage updates the Call Lead.
  3. Rows in Booked Jobs (prior = 5) are NEVER touched.
  4. Rows in Follow Up Estimates with no matching Call Lead are reported
     as "no_match" and skipped — try again later once the CSR creates one.
  5. Errors do not stop the loop — they show up in the cycle's progress list.
```

---

## 6. Shared building blocks

These are the reusable bits that both Workspace A and Workspace C use.
Worth extracting before we start typing.

### 6.1 `IntervalPicker`

- Renders `<input type="number">` + `<select>` (Seconds/Minutes/Hours).
- Emits `intervalMs`.
- Replaces `auto-follow-up-interval` and `auto-call-interval` number inputs.

### 6.2 `Accordion` / `<details>`

- Native `<details><summary>` is fine — no JS framework needed.
- Used for ScanAndSync history, Booked Jobs section, explainer callout, and
  the optional "Log Tables" expanded view.

### 6.3 `LogTablesPanel` (new)

When the user clicks `[Log Tables 📋]` in Workspace A or C:

```
─ Log Tables — Form Leads (Follow Up Estimates) ──────────────────────────────
│
│  Logged 12 row(s) to DevTools console (filter "[Granot Sync]").
│
│  ▾ Click to view inline (read-only)
│  ┌───────────────────────────────────────────────────────────────────────┐
│  │ #  │ job_no │ source   │ ref_no    │ prior │ est_cf │ customer │ phone│
│  │ 1  │ 12345  │ web      │ 67ab…ef9  │ 1     │ 850    │ Jane S.  │ 555… │
│  │ 2  │ 12346  │ referral │ 67ab…ef0  │ 0     │ —      │ John D.  │ 555… │
│  │ …                                                                     │
│  └───────────────────────────────────────────────────────────────────────┘
─────────────────────────────────────────────────────────────────────────────
```

- Calls `console.table(parsedRows)` so DevTools shows a sortable table too.
- Different from existing "Debug: Log Tables" which dumps every raw `<table>`
  on the page — that one stays under the Debug section in the sidebar.
- Implementation: just renders the same `parsedRows` / `callLeadEnrichmentRows`
  the workspace already holds; no extra scrape needed. If the workspace has
  not scanned yet, it offers a "Scan now" button.

### 6.4 `RowList` (the selectable + per-row-sync component)

Used in 3a and 5a. Shape:

```
[☑] [#row]  [primary title]   [meta line]                [status badge]  [Sync]
```

- Checkbox is disabled when row is not syncable.
- `[Sync]` button is hidden when row is not syncable. Disabled while
  `isBusy` or while ScanAndSync is running.
- Hidden entirely while ScanAndSync is running for this workspace.

### 6.5 `ScanAndSyncProgress` accordion list

```
▾ Cycle #N — HH:MM:SS   <status icon>   <summary line>
   │ ├ row 1 detail
   │ ├ row 2 detail
   │ └ row N detail
```

- Latest cycle expanded; older cycles collapsed.
- Cap at 20 cycles in memory (today's cap is 40 — fine to keep 40 if we want).
- Filter dropdown (Show All / Syncable / Failed) filters which **detail lines**
  show within an expanded cycle, not which cycles are listed.

### 6.6 `StatusBar`

- Replaces today's free-floating `#status` div.
- Sticky at the bottom of the popup/window.
- Shows current activity message + small spinner while busy.

---

## 7. Mode & state model (TypeScript sketch)

This is just to confirm the new layout doesn't require us to rip out the
existing scan/sync logic — we just need to organize state per-workspace.

```ts
type WorkspaceId = "form-leads" | "form-edit-lead" | "call-leads"
                 | "diagnose" | "debug";

type IntervalUnit = "seconds" | "minutes" | "hours";

type FormLeadsState = {
  parsedRows: FollowUpRow[];
  selectedRowIds: Set<string>;
  syncResults: Map<string, RowSyncResult>;
  cycles: AutoCycleEntry[];                    // replaces autoProgressEntries
  progressFilter: ProgressFilter;
  intervalValue: number;                       // raw value in chosen unit
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  nextRunAt?: number;                          // for the countdown display
};

type CallLeadsState = {
  preview?: CallLeadPreviewResponse;
  enrichmentRows: CallLeadEnrichmentPreview[];
  selectedRowIds: Set<string>;
  cycles: AutoCycleEntry[];
  progressFilter: ProgressFilter;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  nextRunAt?: number;
};

type AppState = {
  activeWorkspace: WorkspaceId;
  isBusy: boolean;
  statusMessage: string;
  formLeads: FormLeadsState;
  formEditLead: { /* preview + override + result, same as today */ };
  callLeads: CallLeadsState;
};
```

Behavior rules:

1. `isBusy` is global — only one sync request runs at a time across all
   workspaces (matches today's `isBusy` flag).
2. ScanAndSync timers are **per workspace** but **paused when another
   workspace's sync is in flight** (matches today's `if (isBusy)` guard).
3. Switching workspace does **not** stop a running ScanAndSync — the loop
   keeps running in the background and the sidebar item shows a tiny
   spinner/pulse next to its label so the owner knows.
4. Closing the popup (when not detached) does stop everything because the
   popup DOM is destroyed. The detached movable window does **not** lose
   state when the popup is reopened — same as today.

---

## 8. New per-row Sync button — flow

In Workspace A and Workspace C, each syncable row gets `[Sync]`. The flow:

```
User clicks row [Sync]
   └── setBusy(true), set row.status = "syncing", render
        └── syncLeadCandidates([row])  (form-leads)
            OR syncCallLeadEnrichment([row.payload])  (call-leads)
              └── update syncResults map for this row.id
                  └── setBusy(false), render with updated badge
                  └── status bar: "#3 Acme Co — updated quoted true, cubic_feet 2100"
```

Edge cases:

- If ScanAndSync is running and the row's cycle is between scan and sync,
  the `[Sync]` button is disabled because `isBusy === true` at that moment.
- If a row becomes invalid mid-flight (page changed) the result still attaches
  to the row id; the next scan will refresh the row.

---

## 9. CSS layout sketch

Today's index.html is one `<style>` block with workflow cards in a grid.
We replace the grid with a CSS `grid-template-areas` shell:

```css
.app {
  display: grid;
  grid-template-areas:
    "top   top"
    "side  main"
    "bar   bar";
  grid-template-columns: 180px 1fr;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
}
.app__top   { grid-area: top; }
.app__side  { grid-area: side; }
.app__main  { grid-area: main; overflow-y: auto; padding: 16px; }
.app__bar   { grid-area: bar; }

@media (max-width: 740px) {
  .app { grid-template-columns: 56px 1fr; }
  .app__side .sidebar__label { display: none; }       /* icon-only */
}

@media (max-width: 520px) {
  .app {
    grid-template-areas: "top" "side" "main" "bar";
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto;
  }
  .app__side { display: flex; overflow-x: auto; }     /* horizontal tabs */
}
```

The workspace panels go inside `.app__main` and only one is visible at a time
(`display: none` on the others) — easier to reason about than today's
"`.active` class toggles three siblings".

---

## 10. Suggested implementation order (proposal)

A safe path that keeps the extension working at every step:

1. **HTML shell refactor** — add the sidebar, status bar, top bar; keep the
   three workspace panels but move them inside `.app__main`. No JS changes.
2. **Sidebar tab switching** — `activeWorkspace` state replaces the current
   `activeMode`. All existing buttons and panels keep their IDs and event
   handlers so nothing breaks; we just wrap them in the new shell.
3. **Per-row `[Sync]` buttons** — add to `renderRows()` (Form Leads) and
   `renderCallLeadRow()` (Call Leads), wired to `syncRows([row])` /
   `syncCallRows([row.payload])`. Pure additive change.
4. **IntervalPicker** — replace the two `<input type="number"> sec` widgets
   with the value+unit dropdown pair. Tiny change to `getAutoIntervalMs`.
5. **ScanAndSync explainer (ⓘ)** — pure HTML/CSS, no behavior change.
6. **Accordion cycle history** — refactor `addAutoProgressEntry` /
   `renderAutoProgressLog` to emit one `<details>` per cycle with nested
   per-row `<li>`s.
7. **Hide selectable list while ScanAndSync running** — wrap `renderRows` /
   `renderCallLeadPreview` row sections in `if (!autoSyncRunning[workflow])`,
   show the "Manual selection paused" banner instead.
8. **`[Log Tables]` button per workspace** — small new component that
   `console.table`s + renders an inline `<table>` from the current parsed
   state (or scans on demand).
9. **Form Edit Lead diff table** — refactor `renderCurrentLead()` to draw
   the two-column diff plus radio override.
10. **Status bar polish** — move `#status` into the new bottom strip, add
    `aria-live="polite"`.
11. **Optional**: persist `intervalValue` / `intervalUnit` / last
    `activeWorkspace` in `browser.storage.local` so reopening the popup
    restores them.

Each step is independently shippable and reviewable.

---

## 11. Open questions (please confirm before I start)

1. **Sidebar icons** — emoji ok (📋 ✏️ 📞 🩺 🪲)? Or should we use an SVG
   icon set (lucide / heroicons)?  Emoji ships zero bytes; SVGs look cleaner.
2. **Default interval units** — Form Leads default `30 seconds`, Call Leads
   default `1 minute`?  Or both default the same?
3. **Cycle history cap** — keep today's 40 cycles, or trim to 20 to keep the
   accordion list short?
4. **Persistence** — store `activeWorkspace`, interval pickers, and progress
   filters in `browser.storage.local` so the owner doesn't have to re-set
   them every popup open? (I'd recommend yes.)
5. **`[Log Tables]` modal vs inline** — render the table inline within the
   workspace (less popping) or in a modal overlay (more focused, but extra
   complexity)?
6. **Per-row `[Sync]` while ScanAndSync running** — should it be hidden, or
   shown-but-disabled, when the auto loop is going?  My recommendation:
   hidden, because the row list itself is hidden in that mode.
7. **Booked Jobs accordion default state** — collapsed (recommended) or
   expanded?  Some owners may want a constant glance at booked jobs.
8. **Diagnose & Debug tabs** — keep both in the sidebar as recommended, or
   tuck them under a single "Advanced" footer link?

---

## 12. What's explicitly NOT in this redesign

- No change to the content script's table parsing (`granot-crm.content.ts`).
- No change to the Vantage API endpoints or `utils/api.ts`.
- No change to how messages are routed across frames (`sendActiveTabMessage`,
  `aggregateFrameResponses`).
- No change to `wxt.config.ts`, manifest, or build pipeline.
- No new permissions requested.

This is purely a popup-side UI/UX overhaul.
